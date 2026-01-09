// services/alerts.js

/**
 * Create a "new listing" alert event for a result row.
 * This is the canonical place to insert alert_events.
 *
 * Requires:
 *  - a results row already exists (so we can store result_id)
 *  - a stable dedupe_key so duplicates are ignored
 *
 * Returns:
 *  { inserted: boolean, dedupeKey: string, alertId?: number }
 */

async function createNewListingAlert({ pool, searchId, resultId, marketplace, externalId }) {
  if (!pool) throw new Error('createNewListingAlert requires { pool }');
  if (!searchId) throw new Error('createNewListingAlert requires { searchId }');
  if (!resultId) throw new Error('createNewListingAlert requires { resultId }');
  if (!marketplace) throw new Error('createNewListingAlert requires { marketplace }');
  if (!externalId) throw new Error('createNewListingAlert requires { externalId }');

  // Stable dedupe key (match your existing pattern, but include result identity)
  const dedupeKey = `new_listing:${marketplace}:v2|search=${searchId}|item=${externalId}|result=${resultId}`;


  const sql = `
    INSERT INTO alert_events (search_id, result_id, status, dedupe_key)
    VALUES ($1, $2, 'pending', $3)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;

  const r = await pool.query(sql, [searchId, resultId, dedupeKey]);

  return {
    inserted: r.rowCount === 1,
    dedupeKey,
    alertId: r.rows?.[0]?.id,
  };
}

module.exports = {
  createNewListingAlert,
};
