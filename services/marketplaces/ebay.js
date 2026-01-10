// services/marketplaces/ebay.js

const { getEbayAppToken } = require('../ebayAuth');

async function searchEbay(search) {
    const q = String(search?.search_item || '').trim();
    if (!q) return [];

    const token = await getEbayAppToken();

    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '50');

    const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
        },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(`eBay error ${resp.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }

    const summaries = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

    return summaries
        .map((it) => {
            const priceVal = it?.price?.value ?? null;
            const currency = it?.price?.currency ?? 'USD';
            const externalId = it?.itemId || it?.legacyItemId || it?.itemWebUrl || null;

            return {
                marketplace: 'ebay',
                external_id: externalId,
                title: it?.title || 'Untitled',
                price: priceVal,
                currency,
                listing_url: it?.itemWebUrl || null,

                // optional extras (refresh.js will tolerate missing)
                image_url: it?.image?.imageUrl || null,
                location: it?.itemLocation?.city || it?.itemLocation?.country || null,
                condition: it?.condition || null,
                seller_username: it?.seller?.username || null,

                raw: it,
            };
        })
        .filter((r) => r.external_id && r.listing_url);
}

module.exports = { searchEbay };
