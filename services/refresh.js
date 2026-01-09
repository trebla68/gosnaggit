// services/refresh.js

const pool = require('../db');
const { getEbayAppToken } = require('./ebayAuth');
const { insertResults } = require('./resultsStore');
const { createNewListingAlert } = require('./alerts');

async function refreshSearchNow({ searchId }) {
    // 1) Validate search
    const check = await pool.query(
        'SELECT id, search_item, status FROM searches WHERE id = $1',
        [searchId]
    );
    if (check.rowCount === 0) throw new Error('Search not found');

    if ((check.rows[0].status || '').toLowerCase() === 'deleted') {
        throw new Error('Cannot refresh a deleted search');
    }
    if ((check.rows[0].status || '').toLowerCase() === 'paused') {
        return { ok: true, searchId, query: check.rows[0].search_item || '', fetched: 0, inserted: 0, alertsInserted: 0, note: 'Search is paused' };
    }

    const q = (check.rows[0].search_item || '').trim();
    if (!q) throw new Error('Search has no search_item to query eBay with');

    // 2) Fetch from eBay
    const token = await getEbayAppToken();

    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '50');

    const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(`eBay error ${resp.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }

    const summaries = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

    // 3) Normalize
    const normalized = summaries
        .map((it) => {
            const priceVal = it?.price?.value ?? null;
            const currency = it?.price?.currency ?? 'USD';
            const externalId = it?.itemId || it?.legacyItemId || it?.itemWebUrl || null;

            return {
                external_id: externalId,
                title: it?.title || 'Untitled',
                price: priceVal,
                currency,
                listing_url: it?.itemWebUrl || null,
                image_url: it?.image?.imageUrl || null,
                location: it?.itemLocation?.city || it?.itemLocation?.country || null,
                condition: it?.condition || null,
                seller_username: it?.seller?.username || null,
                found_at: new Date().toISOString(),
            };
        })
        .filter((r) => r.external_id && r.listing_url);

    // 4) Insert results
    // IMPORTANT: we need a way to map external_id -> result row id so alerts can store result_id.
    // Your resultsStore should return inserted rows or at least IDs. If it currently only returns a count,
    // we follow up by selecting the matching result ids from the DB.
    const ins = await insertResults(pool, searchId, 'ebay', normalized);
    const insertedCount = ins?.inserted || 0;

    // 5) Load result ids for these externals (so alerts always have result_id)
    const externals = normalized.map((r) => r.external_id);

    // If externals is empty, skip
    let resultsByExternal = new Map();
    if (externals.length > 0) {
        const { rows: resultRows } = await pool.query(
            `
      SELECT id, external_id
      FROM results
      WHERE search_id = $1
        AND marketplace = 'ebay'
        AND external_id = ANY($2::text[])
      `,
            [searchId, externals]
        );
        resultsByExternal = new Map(resultRows.map((r) => [r.external_id, r.id]));
    }

    // 6) Create alerts (dedupe prevents duplicates)
    let alertsInserted = 0;
    for (const r of normalized) {
        const resultId = resultsByExternal.get(r.external_id);
        if (!resultId) continue; // Should be rare; but prevents NULL result_id forever.

        const a = await createNewListingAlert({
            pool,
            searchId,
            resultId,
            marketplace: 'ebay',
            externalId: r.external_id,
        });

        if (a.inserted) alertsInserted += 1;
    }

    return {
        ok: true,
        searchId,
        query: q,
        fetched: summaries.length,
        inserted: insertedCount,
        alertsInserted,
    };
}

module.exports = { refreshSearchNow };
