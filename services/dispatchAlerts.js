// services/dispatchAlerts.js

const { sendEmail, buildAlertEmail } = require('./notifications');

/**
 * Dispatch up to `limit` pending alerts for a single search, in ONE email.
 * Uses row-level locking to prevent double-sends if multiple dispatchers run.
 *
 * Tightened behavior:
 * - Only picks pending alerts that have a result_id (prevents blank listings in emails)
 * - Returns pending_before / pending_after for easier debugging
 * - Updates are guarded with AND status='pending' for extra safety
 */
async function dispatchPendingAlertsForSearch({ pool, searchId, toEmail, limit = 25 }) {
    if (!pool) throw new Error('dispatchPendingAlertsForSearch requires { pool }');
    if (!searchId) throw new Error('dispatchPendingAlertsForSearch requires { searchId }');
    if (!toEmail) throw new Error('dispatchPendingAlertsForSearch requires { toEmail }');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        // --------------------
        // Per-search cooldown guard (prevents email spam)
        // --------------------
        const cooldownSec = Number(process.env.DISPATCH_COOLDOWN_SECONDS || 300); // default 5 minutes
        if (cooldownSec > 0) {
            const { rows: cdRows } = await client.query(
                `
          SELECT
            MAX(sent_at) AS last_sent_at,
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


        // Snapshot pending count (useful for debugging/telemetry)
        const { rows: beforeRows } = await client.query(
            `
      SELECT COUNT(*)::int AS pending_before
      FROM alert_events
      WHERE search_id = $1
        AND status = 'pending'
      `,
            [searchId]
        );
        const pending_before = beforeRows[0]?.pending_before ?? 0;

        // Pick + lock pending alert_events rows first (NO joins here),
        // then join to results for email details.
        // This avoids: "FOR UPDATE cannot be applied to the nullable side of an outer join"
        const { rows: pending } = await client.query(
            `
      WITH picked AS (
        SELECT ae.id
        FROM alert_events ae
        WHERE ae.search_id = $1
          AND ae.status = 'pending'
          AND ae.result_id IS NOT NULL
        ORDER BY ae.created_at ASC, ae.id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
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
      JOIN picked p ON p.id = ae.id
      LEFT JOIN results r ON r.id = ae.result_id
      ORDER BY ae.created_at ASC, ae.id ASC
      `,
            [searchId, limit]
        );

        if (pending.length === 0) {
            await client.query('COMMIT');
            return {
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

        // Collect ids once (we update in bulk)
        const alertIds = pending.map((a) => a.alert_id);

        // Build ONE email and send it
        const email = buildAlertEmail({ searchId, alerts: pending });

        try {
            await sendEmail({ to: toEmail, subject: email.subject, text: email.text });

            // Mark all selected as sent in ONE statement (guarded)
            await client.query(
                `UPDATE alert_events SET status = 'sent' WHERE id = ANY($1::int[]) AND status = 'pending'`,
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

            await client.query('COMMIT');

            return {
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
            // If email sending fails, mark the batch error (guarded)
            await client.query(
                `UPDATE alert_events SET status = 'error' WHERE id = ANY($1::int[]) AND status = 'pending'`,
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

            await client.query('COMMIT');

            console.error('Auto-dispatch failed for search', searchId, e);

            return {
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
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // ignore rollback errors
        }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Dispatch pending alerts for every search that has an enabled email destination.
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

    const totals = { searches: 0, selected: 0, emailed: 0, sent: 0, error: 0, skipped: 0, cooldown_skipped: 0 };


    for (const s of settings) {
        totals.searches += 1;

        const r = await dispatchPendingAlertsForSearch({
            pool,
            searchId: s.search_id,
            toEmail: s.destination,
            limit: limitPerSearch,
        });

        totals.selected += r.selected;
        totals.emailed += r.emailed;
        totals.sent += r.sent;
        totals.error += r.error;

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
