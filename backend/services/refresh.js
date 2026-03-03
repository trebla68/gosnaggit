// services/refresh.js

const pool = require('../db');
const { runMarketplaceSearches } = require('./marketplaces');
const { insertResults } = require('./resultsStore');

// Backfill: insert alert_events for ANY results missing alerts (search-wide, future-safe)
async function insertMissingAlertEventsForSearch({ pool, searchId, limit = 5000 }) {
    const sql = `
    INSERT INTO alert_events (search_id, result_id, status, dedupe_key, created_at)
    SELECT r.search_id, r.id, 'pending',
       ('search:' || r.search_id::text || ':result:' || r.id::text),
       NOW()
    FROM results r
    WHERE r.search_id = $1
      AND NOT EXISTS (
        SELECT 1
        FROM alert_events a
        WHERE a.search_id = r.search_id
          AND a.result_id = r.id
      )
    ORDER BY r.found_at DESC NULLS LAST
    LIMIT $2
    RETURNING id
  `;
    const res = await pool.query(sql, [searchId, limit]);
    return res.rowCount || 0;
}


/**
 * Insert "missing" alert_events for results that match (search_id, marketplace, external_id IN externals)
 * and do NOT already have an alert_event row (search_id, result_id).
 *
 * Returns number inserted.
 */
async function insertMissingAlertEventsForBatch({ pool, searchId, marketplace, externals, limit = 1000 }) {
    if (!Array.isArray(externals) || externals.length === 0) return 0;

    const sql = `
    INSERT INTO alert_events (search_id, result_id, status, dedupe_key, created_at)
    SELECT r.search_id, r.id, 'pending',
       ('search:' || r.search_id::text || ':result:' || r.id::text),
       NOW()
    FROM results r
    WHERE r.search_id = $1
      AND r.marketplace = $2
      AND r.external_id = ANY($3::text[])
      AND NOT EXISTS (
        SELECT 1
        FROM alert_events a
        WHERE a.search_id = r.search_id
          AND a.result_id = r.id
      )
    ORDER BY r.found_at DESC NULLS LAST
    LIMIT $4
    RETURNING id
  `;

    const res = await pool.query(sql, [searchId, marketplace, externals, limit]);
    return res.rowCount || 0;
}

async function refreshSearchNow({ searchId }) {
    // 1) Validate search
    const check = await pool.query(
        'SELECT id, search_item, status FROM searches WHERE id = $1',
        [searchId]
    );
    if (check.rowCount === 0) throw new Error('Search not found');

    const status = (check.rows[0].status || '').toLowerCase();

    if (status === 'deleted') {
        return { ok: true, skipped: true, reason: 'deleted' };
    }

    // Always return the richer metrics object (even on early returns)
    const zeroMetrics = {
        created: 0,
        updated: 0,
        skipped: 0,

        // NOTE: "inserted" is historical/back-compat "touched" number (created + updated).
        inserted: 0,

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
            updated: 0,
            skipped: 0,
            touched: 0,

            // new metrics:
            results: { ...zeroMetrics },

            note: 'Search is paused',
        };
    }

    const q = (check.rows[0].search_item || '').trim();
    if (!q) throw new Error('Search has no search_item to query');

    // 2) Fetch from marketplaces (fail-soft happens inside runMarketplaceSearches)
    const { results: listings, marketplaces } = await runMarketplaceSearches(check.rows[0]);

    if (!Array.isArray(listings) || listings.length === 0) {
        return {
            ok: true,
            searchId,
            query: q,
            fetched: 0,

            // back-compat:
            inserted: 0,
            updated: 0,
            skipped: 0,
            touched: 0,
            alertsInserted: 0,

            // new metrics:
            results: { ...zeroMetrics },

            marketplaces,

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

    // Totals
    let fetchedTotal = 0;
    let alertsInsertedTotal = 0;

    // Truthful metrics
    let createdTotal = 0;
    let updatedTotal = 0;
    let skippedTotal = 0;
    let processedTotal = 0;
    let totalIncomingTotal = 0;

    // Back-compat combined metric (created + updated)
    let touchedTotal = 0;

    // 4) Insert results + 5) Create alerts in bulk, per marketplace
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

        createdTotal += ins?.created || 0;
        updatedTotal += ins?.updated || 0;
        skippedTotal += ins?.skipped || 0;
        processedTotal += ins?.processed || 0;

        // Back-compat: created + updated
        touchedTotal += (ins?.created || 0) + (ins?.updated || 0);

        // Bulk insert missing alert_events for these results
        const externals = normalized.map((r) => r.external_id);
        const insertedAlerts = await insertMissingAlertEventsForBatch({
            pool,
            searchId,
            marketplace,
            externals,
            limit: 1000,
        });

        alertsInsertedTotal += insertedAlerts;
    }

    const backfilled = await insertMissingAlertEventsForSearch({ pool, searchId, limit: 5000 });
    alertsInsertedTotal += backfilled;

    return {
        ok: true,
        searchId,
        query: q,
        fetched: fetchedTotal,

        marketplaces,

        // Top-level (truthful + easy to read)
        inserted: createdTotal,
        updated: updatedTotal,
        skipped: skippedTotal,
        touched: touchedTotal,
        alertsInserted: alertsInsertedTotal,

        // Detailed metrics
        results: {
            created: createdTotal,
            updated: updatedTotal,
            skipped: skippedTotal,
            inserted: touchedTotal,
            processed: processedTotal,
            total_incoming: totalIncomingTotal,
        },
    };
}

module.exports = { refreshSearchNow };
