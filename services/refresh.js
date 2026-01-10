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

    // Always return the richer metrics object (even on early returns)
    const zeroMetrics = {
        created: 0,
        updated: 0,
        skipped: 0,
        inserted: 0,       // created + updated (back-compat meaning)
        processed: 0,      // valid rows processed (had external_id + listing_url)
        total_incoming: 0, // total raw items seen (items.length summed)
    };

    if (status === 'paused') {
        return {
            ok: true,
            searchId,
            query: check.rows[0].search_item || '',
            fetched: 0,

            // back-compat:
            inserted: 0,
            alertsInserted: 0,

            // new metrics:
            results: { ...zeroMetrics },

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

            // back-compat:
            inserted: 0,
            alertsInserted: 0,

            // new metrics:
            results: { ...zeroMetrics },

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

    // Totals (existing/back-compat)
    let fetchedTotal = 0;
    let insertedTotal = 0;
    let alertsInsertedTotal = 0;

    // Totals (new metrics)
    let createdTotal = 0;
    let updatedTotal = 0;
    let skippedTotal = 0;
    let processedTotal = 0;
    let totalIncomingTotal = 0;

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
                found_at: it.found_at ?? null,
                raw: null,
            }))
            .filter((r) => r.external_id && r.listing_url);

        // Track raw incoming for metrics (even if normalization drops some)
        totalIncomingTotal += Array.isArray(items) ? items.length : 0;

        if (normalized.length === 0) continue;

        // Insert/Upsert results (now returns richer metrics)
        const ins = await insertResults(pool, searchId, marketplace, normalized);

        const insertedCount = ins?.inserted || 0;
        insertedTotal += insertedCount;

        createdTotal += ins?.created || 0;
        updatedTotal += ins?.updated || 0;
        skippedTotal += ins?.skipped || 0;
        processedTotal += ins?.processed || 0;

        // If you want total_incoming to reflect only what you passed to insertResults,
        // uncomment the next line and remove the earlier totalIncomingTotal += items.length
        // totalIncomingTotal += ins?.total_incoming || 0;

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

            if (a && a.inserted) alertsInsertedTotal += 1;
        }
    }

    return {
        ok: true,
        searchId,
        query: q,
        fetched: fetchedTotal,

        // back-compat:
        inserted: insertedTotal,
        alertsInserted: alertsInsertedTotal,

        // new metrics:
        results: {
            created: createdTotal,
            updated: updatedTotal,
            skipped: skippedTotal,
            inserted: insertedTotal,      // created + updated (insertResults back-compat)
            processed: processedTotal,    // valid rows processed by insertResults
            total_incoming: totalIncomingTotal,
        },
    };
}

module.exports = { refreshSearchNow };
