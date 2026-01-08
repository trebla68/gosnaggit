// services/dispatchAlerts.js

const { sendEmail, buildAlertEmail } = require('./notifications');

/**
 * Dispatch up to `limit` pending alerts for a single search, in ONE email.
 * Uses row-level locking to prevent double-sends if multiple dispatchers run.
 */
async function dispatchPendingAlertsForSearch({ pool, searchId, toEmail, limit = 25 }) {
    if (!pool) throw new Error('dispatchPendingAlertsForSearch requires { pool }');
    if (!searchId) throw new Error('dispatchPendingAlertsForSearch requires { searchId }');
    if (!toEmail) throw new Error('dispatchPendingAlertsForSearch requires { toEmail }');

    // We lock the chosen pending rows so concurrent dispatchers don't grab them too.
    // This makes it safe for worker + dev triggers, or multiple workers in the future.
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1) Select and lock up to `limit` pending alerts for this search
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
      WHERE ae.search_id = $1
        AND ae.status = 'pending'
      ORDER BY ae.created_at ASC, ae.id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
      `,
            [searchId, limit]
        );

        if (pending.length === 0) {
            await client.query('COMMIT');
            return { search_id: searchId, to: toEmail, selected: 0, emailed: 0, sent: 0, error: 0 };
        }

        // Collect ids once (we update in bulk)
        const alertIds = pending.map((a) => a.alert_id);

        // 2) Build ONE email and send it (outside the DB mutation step, but still within tx)
        // If this fails, we'll mark the whole batch as error.
        const email = buildAlertEmail({ searchId, alerts: pending });

        try {
            await sendEmail({ to: toEmail, subject: email.subject, text: email.text });

            // 3) Mark all selected as sent in ONE statement
            await client.query(
                `UPDATE alert_events SET status = 'sent' WHERE id = ANY($1::int[])`,
                [alertIds]
            );

            await client.query('COMMIT');

            return {
                search_id: searchId,
                to: toEmail,
                selected: pending.length,
                emailed: 1,
                sent: pending.length,
                error: 0,
            };
        } catch (e) {
            // If email sending fails, mark the batch error (still safe + atomic)
            await client.query(
                `UPDATE alert_events SET status = 'error' WHERE id = ANY($1::int[])`,
                [alertIds]
            );

            await client.query('COMMIT');

            console.error('Auto-dispatch failed for search', searchId, e);

            return {
                search_id: searchId,
                to: toEmail,
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

async function dispatchAllEnabledEmailAlerts({ pool, limitPerSearch = 25 }) {
    // Pull enabled email destinations for searches
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

    const totals = { searches: 0, selected: 0, emailed: 0, sent: 0, error: 0 };

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
    }

    return totals;
}

module.exports = {
    dispatchPendingAlertsForSearch,
    dispatchAllEnabledEmailAlerts,
};
