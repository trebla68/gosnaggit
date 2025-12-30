// services/ebaySearch.js
const { getEbayAppToken } = require('./ebayAuth'); // you already have this
const fetch = global.fetch;

async function searchEbayListings({ q, maxPrice }) {
    const token = await getEbayAppToken();

    const params = new URLSearchParams();
    params.set('q', q || '');
    params.set('limit', '10');

    // optional filters
    const filters = [];
    if (maxPrice) filters.push(`price:[..${Number(maxPrice)}]`);

    if (filters.length) params.set('filter', filters.join(','));

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE_ID || 'EBAY_US'
        }
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`eBay search failed ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const items = data.itemSummaries || [];

    // Normalize to our internal listing shape
    return items.map((it) => ({
        external_id: it.itemId,
        title: it.title,
        price: it.price?.value ?? null,
        currency: it.price?.currency ?? 'USD',
        listing_url: it.itemWebUrl
    }));
}

module.exports = { searchEbayListings };
