// services/searchRunner.js
const pool = require('../db');
const { refreshSearchFromEbay } = require('./ebayRefresh');

// MVP: checks active searches; later we’ll add last_checked_at + frequency logic
async function getActiveSearches(limit = 10) {
    const { rows } = await pool.query(
        `
    SELECT
      id,
      search_item AS query,
      location,
      category,
      max_price
    FROM searches
    WHERE status = 'active'
    ORDER BY id DESC
    LIMIT $1
    `,
        [limit]
    );
    return rows;
}

async function runDueSearchesOnce() {
    const searches = await getActiveSearches(5);

    if (!searches.length) return;

    console.log(`[runner] checking ${searches.length} active search(es)`);

    for (const s of searches) {
        try {
            console.log(`[runner] refreshing search ${s.id} (${s.query || 'no query'})`);
            await refreshSearchFromEbay(s);
        } catch (err) {
            console.error(`[runner] search ${s.id} refresh failed:`, err);
        }
    }
}

module.exports = { runDueSearchesOnce };
