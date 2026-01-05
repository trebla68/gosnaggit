// services/refresh.js
const pool = require('../db'); // if your db file is different, tell me and we’ll adjust
const { getEbayAppToken } = require('./ebayAuth');
const { insertResults } = require('./resultsStore');
const { createNewListingAlert } = require('./alerts');

async function refreshSearchNow({ searchId }) {
    const check = await pool.query(
        'SELECT id, search_item, status FROM searches WHERE id = $1',
        [searchId]
    );
    if (check.rowCount === 0) throw new Error('Search not found');

    if ((check.rows[0].status || '').toLowerCase() === 'deleted') {
        throw new Error('Cannot refresh a deleted search');
    }

    const q = (check.rows[0].search_item || '').trim();
    if (!q) throw new Error('Search has no search_item to query eBay with');

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

    const normalized = summaries
        .map((it) => {
            const priceVal = it?.price?.value ?? null;
            const currency = it?.price?.currency ?? 'USD';

            return {
                external_id: it?.itemId || it?.legacyItemId || it?.itemWebUrl || null,
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

    const { inserted } = await insertResults(pool, searchId, 'ebay', normalized);

    // Create alerts (dedupe prevents duplicates)
    let alertsInserted = 0;
    for (const r of normalized) {
        const a = await createNewListingAlert({
            searchId,
            marketplace: 'ebay',
            itemId: r.external_id,
        });
        if (a.inserted) alertsInserted += 1;
    }

    return {
        ok: true,
        searchId,
        query: q,
        fetched: summaries.length,
        inserted: inserted || 0,
        alertsInserted,
    };
}

module.exports = { refreshSearchNow };

