// services/dispatchAlerts.js

const { sendEmail, buildAlertEmail } = require('./notifications');

/**
 * Dispatch up to `limit` pending alerts for a single search, in ONE email.
 *
 * Safety + behavior:
 * - Per-search cooldown: skips sending if the last SENT email for this search was too recent
 * - Multi-worker safe: uses row-level locks (FOR UPDATE SKIP LOCKED) to claim rows
 * - Crash-safe: requeues "sending" rows that look stuck back to "pending"
 * - Status transitions are guarded (pending→sending, then sending→sent/error)
 *
 * Env knobs (optional):
 * - DISPATCH_COOLDOWN_SECONDS (default 300)
 * - DISPATCH_SENDING_STUCK_MINUTES (default 15)
 */
async function dispatchPendingAlertsForSearch({ pool, searchId, toEmail, limit = 25 }) {
    if (!pool) throw new Error('dispatchPendingAlertsForSearch requires { pool }');
    if (!searchId) throw new Error('dispatchPendingAlertsForSearch requires { searchId }');
    if (!toEmail) throw new Error('dispatchPendingAlertsForSearch requires { toEmail }');

    const client = await pool.connect();

    // Claimed IDs (pending → sending) so we can email OUTSIDE the transaction.
    let alertIds = [];
    let pending_before = 0;

    // Track txn state so we don't try to ROLLBACK after COMMIT.
    let inTxn = false;

    try {
        await client.query('BEGIN');
        inTxn = true;

        // --------------------
        // Per-search cooldown guard (prevents email spam)
        // --------------------
        const cooldownSec = Number(process.env.DISPATCH_COOLDOWN_SECONDS || 300); // default 5 minutes
        if (cooldownSec > 0) {
            const { rows: cdRows } = await client.query(
                `
        SELECT
          EXTRACT(EPOCH FROM (NOW() - MAX(sent_at)))::int AS seconds_since_last_sent
        FROM alert_events
        WHERE search_id = $1
          AND status = 'sent'
          AND sent_at IS NOT NULL
        `,
                [searchId]
            );

            const secondsSince = cdRows && cdRows[0] ? cdRows[0].seconds_since_last_sent : null;

            if (secondsSince !== null && secondsSince < cooldownSec) {
                await client.query('ROLLBACK');
                inTxn = false;
                return {
                    ok: true,
                    search_id: searchId,
                    selected: 0,
                    emailed: 0,
                    sent: 0,
                    error: 0,
                    skipped: true,
                    reason: 'cooldown',
                    seconds_since_last_sent: secondsSince,
                    cooldown_seconds: cooldownSec,
                };
            }
        }

        // --------------------
        // Crash-safety: requeue stuck "sending" rows back to pending
        // (e.g. if a worker crashed after claiming but before marking sent/error)
        // --------------------
        const stuckMin = Number(process.env.DISPATCH_SENDING_STUCK_MINUTES || 15);
        if (stuckMin > 0) {
            await client.query(
                `
        UPDATE alert_events
        SET status = 'pending'
        WHERE search_id = $1
          AND status = 'sending'
          AND created_at < NOW() - ($2 * INTERVAL '1 minute')
        `,
                [searchId, stuckMin]
            );
        }

        // Snapshot pending count (useful telemetry/debug)
        {
            const { rows: beforeRows } = await client.query(
                `
        SELECT COUNT(*)::int AS pending_before
        FROM alert_events
        WHERE search_id = $1
          AND status = 'pending'
        `,
                [searchId]
            );
            pending_before = beforeRows[0]?.pending_before ?? 0;
        }

        // --------------------
        // Pick + lock pending rows (multi-worker safe)
        // Only rows with result_id to avoid blank listings
        // --------------------
        const { rows: picked } = await client.query(
            `
      SELECT ae.id
      FROM alert_events ae
      WHERE ae.search_id = $1
        AND ae.status = 'pending'
        AND ae.result_id IS NOT NULL
      ORDER BY ae.created_at ASC, ae.id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $2
      `,
            [searchId, limit]
        );

        alertIds = (picked || []).map((r) => r.id);

        if (alertIds.length === 0) {
            await client.query('ROLLBACK');
            inTxn = false;
            return {
                ok: true,
                search_id: searchId,
                to: toEmail,
                pending_before,
                pending_after: pending_before,
                selected: 0,
                emailed: 0,
                sent: 0,
                error: 0,
            };
        }

        // Mark claimed rows as "sending" (guarded) so other workers won't touch them
        await client.query(
            `
      UPDATE alert_events
      SET status = 'sending', error_message = NULL
      WHERE id = ANY($1::int[])
        AND status = 'pending'
      `,
            [alertIds]
        );

        await client.query('COMMIT');
        inTxn = false;

        // --------------------
        // OUTSIDE transaction: fetch details, send ONE email, mark sent/error
        // --------------------
        const { rows: pending } = await client.query(
            `
      SELECT
        ae.id AS alert_id,
        ae.search_id,
        ae.status,
        ae.created_at AS alert_created_at,
        r.title,
        r.price,
        r.currency,
        r.listing_url,
        r.marketplace,
        r.external_id
      FROM alert_events ae
      LEFT JOIN results r ON r.id = ae.result_id
      WHERE ae.id = ANY($1::int[])
      ORDER BY ae.created_at ASC, ae.id ASC
      `,
            [alertIds]
        );

        // Build ONE email and send it
        const email = buildAlertEmail({ searchId, alerts: pending });

        try {
            await sendEmail({ to: toEmail, subject: email.subject, text: email.text });

            // Mark all selected as sent (guarded: only rows we claimed)
            await client.query(
                `
        UPDATE alert_events
        SET status = 'sent', sent_at = NOW(), error_message = NULL
        WHERE id = ANY($1::int[])
          AND status = 'sending'
        `,
                [alertIds]
            );

            const { rows: afterRows } = await client.query(
                `
        SELECT COUNT(*)::int AS pending_after
        FROM alert_events
        WHERE search_id = $1
          AND status = 'pending'
        `,
                [searchId]
            );
            const pending_after = afterRows[0]?.pending_after ?? 0;

            return {
                ok: true,
                search_id: searchId,
                to: toEmail,
                pending_before,
                pending_after,
                selected: pending.length,
                emailed: 1,
                sent: pending.length,
                error: 0,
            };
        } catch (e) {
            const msg = (e && e.message ? e.message : String(e)).slice(0, 500);

            // If email sending fails, mark the batch error (guarded: only rows we claimed)
            await client.query(
                `
        UPDATE alert_events
        SET status = 'error', error_message = $2
        WHERE id = ANY($1::int[])
          AND status = 'sending'
        `,
                [alertIds, msg]
            );

            const { rows: afterRows } = await client.query(
                `
        SELECT COUNT(*)::int AS pending_after
        FROM alert_events
        WHERE search_id = $1
          AND status = 'pending'
        `,
                [searchId]
            );
            const pending_after = afterRows[0]?.pending_after ?? 0;

            console.error('Auto-dispatch failed for search', searchId, e);

            return {
                ok: false,
                search_id: searchId,
                to: toEmail,
                pending_before,
                pending_after,
                selected: pending.length,
                emailed: 0,
                sent: 0,
                error: pending.length,
            };
        }
    } catch (err) {
        if (inTxn) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                // ignore rollback errors
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Dispatch pending alerts for every search that has an enabled email destination.
 * Returns totals; each search is isolated so one failure doesn't stop the batch.
 */
async function dispatchAllEnabledEmailAlerts({ pool, limitPerSearch = 25 }) {
    const { rows: settings } = await pool.query(
        `
    SELECT search_id, destination
    FROM notification_settings
    WHERE channel = 'email'
      AND is_enabled = TRUE
      AND destination IS NOT NULL
    ORDER BY search_id ASC
    `
    );

    const totals = {
        searches: 0,
        selected: 0,
        emailed: 0,
        sent: 0,
        error: 0,
        skipped: 0,
        cooldown_skipped: 0,
    };

    for (const s of settings) {
        totals.searches += 1;

        let r;
        try {
            r = await dispatchPendingAlertsForSearch({
                pool,
                searchId: s.search_id,
                toEmail: s.destination,
                limit: limitPerSearch,
            });
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            console.error('[dispatch] search failed', { search_id: s.search_id, error: msg });
            totals.error += 1;
            continue;
        }

        // Log when a search is skipped (cooldown, etc)
        if (r && r.skipped) {
            console.log('[dispatch] skipped', {
                search_id: s.search_id,
                reason: r.reason,
                seconds_since_last_sent: r.seconds_since_last_sent,
                cooldown_seconds: r.cooldown_seconds,
            });
        }

        totals.selected += r.selected || 0;
        totals.emailed += r.emailed || 0;
        totals.sent += r.sent || 0;
        totals.error += r.error || 0;

        // Track skipped (cooldown) searches
        if (r && r.skipped) {
            totals.skipped += 1;
            if (r.reason === 'cooldown') totals.cooldown_skipped += 1;
        }
    }

    return totals;
}

module.exports = {
    dispatchPendingAlertsForSearch,
    dispatchAllEnabledEmailAlerts,
};
