// services/refresh.js

const pool = require('../db');
const { runMarketplaceSearches } = require('./marketplaces');
const { insertResults } = require('./resultsStore');
const { createNewListingAlert } = require('./alerts');

async function refreshSearchNow({ searchId }) {
    // 1) Validate search
    const check = await pool.query(
        'SELECT id, search_item, status FROM searches WHERE id = $1',
        [searchId]
    );
    if (check.rowCount === 0) throw new Error('Search not found');

    const status = (check.rows[0].status || '').toLowerCase();

    if (status === 'deleted') {
        throw new Error('Cannot refresh a deleted search');
    }
    if (status === 'paused') {
        return {
            ok: true,
            searchId,
            query: check.rows[0].search_item || '',
            fetched: 0,
            inserted: 0,
            alertsInserted: 0,
            note: 'Search is paused',
        };
    }

    const q = (check.rows[0].search_item || '').trim();
    if (!q) throw new Error('Search has no search_item to query');

    // 2) Fetch from marketplaces (fail-soft happens inside runMarketplaceSearches)
    const listings = await runMarketplaceSearches(check.rows[0]);

    if (!Array.isArray(listings) || listings.length === 0) {
        return {
            ok: true,
            searchId,
            query: q,
            fetched: 0,
            inserted: 0,
            alertsInserted: 0,
            note: 'No listings found (or marketplaces unavailable)',
        };
    }

    // 3) Group listings by marketplace
    const byMarketplace = new Map();
    for (const item of listings) {
        const mp = String(item.marketplace || '').toLowerCase().trim();
        if (!mp) continue;
        if (!byMarketplace.has(mp)) byMarketplace.set(mp, []);
        byMarketplace.get(mp).push(item);
    }

    let fetchedTotal = 0;
    let insertedTotal = 0;
    let alertsInsertedTotal = 0;

    // 4) Insert results + 5) Load ids + 6) Create alerts, per marketplace
    for (const [marketplace, items] of byMarketplace.entries()) {
        fetchedTotal += items.length;

        const normalized = items
            .map((it) => ({
                external_id: it.external_id,
                title: it.title || 'Untitled',
                price: it.price ?? null,
                currency: it.currency || 'USD',
                listing_url: it.listing_url || null,

                // optional extras
                image_url: it.image_url || null,
                location: it.location || null,
                condition: it.condition || null,
                seller_username: it.seller_username || null,
                found_at: new Date().toISOString(),
            }))
            .filter((r) => r.external_id && r.listing_url);

        if (normalized.length === 0) continue;

        // Insert results
        const ins = await insertResults(pool, searchId, marketplace, normalized);
        const insertedCount = ins?.inserted || 0;
        insertedTotal += insertedCount;

        // Load result ids for externals (so alerts always have result_id)
        const externals = normalized.map((r) => r.external_id);

        let resultsByExternal = new Map();
        if (externals.length > 0) {
            const { rows: resultRows } = await pool.query(
                `
        SELECT id, external_id
        FROM results
        WHERE search_id = $1
          AND marketplace = $2
          AND external_id = ANY($3::text[])
        `,
                [searchId, marketplace, externals]
            );
            resultsByExternal = new Map(resultRows.map((r) => [r.external_id, r.id]));
        }

        // Create alerts (dedupe prevents duplicates)
        for (const r of normalized) {
            const resultId = resultsByExternal.get(r.external_id);
            if (!resultId) continue;

            const a = await createNewListingAlert({
                pool,
                searchId,
                resultId,
                marketplace,
                externalId: r.external_id,
            });

            if (a.inserted) alertsInsertedTotal += 1;
        }
    }

    return {
        ok: true,
        searchId,
        query: q,
        fetched: fetchedTotal,
        inserted: insertedTotal,
        alertsInserted: alertsInsertedTotal,
    };
}

module.exports = { refreshSearchNow };
