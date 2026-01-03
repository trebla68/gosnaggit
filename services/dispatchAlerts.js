// services/dispatchAlerts.js

const { sendEmail, buildAlertEmail } = require('./notifications');

async function dispatchPendingAlertsForSearch({ pool, searchId, toEmail, limit = 25 }) {
    // Get pending alerts for this search
    const { rows: pending } = await pool.query(
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
    `,
        [searchId, limit]
    );

    if (pending.length === 0) {
        return { search_id: searchId, to: toEmail, dispatched: 0, sent: 0, error: 0 };
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const alert of pending) {
        try {
            const email = buildAlertEmail({ searchId, alert });
            await sendEmail({ to: toEmail, subject: email.subject, text: email.text });

            await pool.query(`UPDATE alert_events SET status = 'sent' WHERE id = $1`, [alert.alert_id]);
            sentCount += 1;
        } catch (e) {
            await pool.query(`UPDATE alert_events SET status = 'error' WHERE id = $1`, [alert.alert_id]);
            errorCount += 1;
            console.error('Auto-dispatch failed for alert', alert.alert_id, e);
        }
    }

    return { search_id: searchId, to: toEmail, dispatched: pending.length, sent: sentCount, error: errorCount };
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

    let totals = { searches: 0, dispatched: 0, sent: 0, error: 0 };

    for (const s of settings) {
        totals.searches += 1;

        const r = await dispatchPendingAlertsForSearch({
            pool,
            searchId: s.search_id,
            toEmail: s.destination,
            limit: limitPerSearch,
        });

        totals.dispatched += r.dispatched;
        totals.sent += r.sent;
        totals.error += r.error;
    }

    return totals;
}

module.exports = {
    dispatchPendingAlertsForSearch,
    dispatchAllEnabledEmailAlerts,
};
