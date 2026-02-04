// services/marketplaces/etsy.js
//
// Etsy Open API v3 (public-ish listing search)
// Notes:
// - Etsy requires x-api-key header containing: "<keystring>:<shared_secret>" for all v3 requests.
// - Some endpoints also require OAuth (Authorization: Bearer ...). For marketplace-wide *read* endpoints,
//   Etsy's docs indicate api_key auth is sufficient, but this may change.
// - If Etsy rejects marketplace-wide keyword search for your access level, we fail-soft and return [].
//
// Docs (essentials):
// - Request Standards (headers): https://developers.etsy.com/documentation/essentials/requests
// - URL Syntax (limit/offset): https://developers.etsy.com/documentation/essentials/urlsyntax

function normalizeEtsyItem(item) {
  const title = item.title || item.listing_title || item.name || '(Etsy listing)';
  const url = item.url || item.listing_url || item.listing_url_full || item.url_full || null;

    // { amount: 1234, divisor: 100, currency_code: "USD" }
    if (typeof m.amount === 'number') {
        const divisor = typeof m.divisor === 'number' && m.divisor !== 0 ? m.divisor : 100;
        const price = m.amount / divisor;
        const currency = m.currency_code || m.currency || null;
        return { price, currency };
    }

    // { value: "12.34", currency: "USD" } or similar
    if (m.value != null) {
        const price = Number(m.value);
        const currency = m.currency || m.currency_code || null;
        return { price: Number.isFinite(price) ? price : null, currency };
    }

    // If price is already numeric-ish
    if (typeof m === 'number') return { price: m, currency: null };
    if (typeof m === 'string') {
        const price = Number(m);
        return { price: Number.isFinite(price) ? price : null, currency: null };
    }

    return { price: null, currency: null };
}

function buildKeywords(search) {
    // Match your existing search object shape as best as possible
    // (search.search_item is what you’ve used elsewhere)
    return String(search?.search_item || search?.query || search?.keywords || '').trim();
}

// Try a couple endpoint shapes; Etsy docs show /application/listings?state=active :contentReference[oaicite:3]{index=3}
// Some setups also accept /application/listings/active
async function fetchEtsyListings({ keywords, limit = 50, offset = 0 }) {
    const headers = {
        'x-api-key': getEtsyApiKeyHeader(),
        'accept': 'application/json'
    };

    const qs = new URLSearchParams();
    if (keywords) qs.set('keywords', keywords);
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));

    const candidates = [
        `${ETSY_BASE_URL}/listings/active?${qs.toString()}`,
        `${ETSY_BASE_URL}/listings?${new URLSearchParams({ state: 'active', ...Object.fromEntries(qs) }).toString()}`
    ];

    let lastErr = null;

    for (const url of candidates) {
        try {
            const { controller, done } = withTimeout(15000);
            const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
            done();

            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                throw new Error(`Etsy HTTP ${resp.status} ${resp.statusText} for ${url} :: ${text.slice(0, 200)}`);
            }

            return await resp.json();
        } catch (err) {
            lastErr = err;
        }
    }

    throw lastErr || new Error('Etsy request failed');
}

function extractResults(json) {
    // Etsy responses commonly look like: { results: [...], count, ... }
    const arr = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
    return arr;
}

function toNormalizedListing(listing) {
    const id =
        listing?.listing_id ??
        listing?.id ??
        listing?.listingId ??
        listing?.listingID;

    const title = listing?.title ?? listing?.name ?? null;

    const { price, currency } = normalizeMoney(
        listing?.price ??
        listing?.price_money ??
        listing?.money ??
        listing?.amount
    );

    const url =
        listing?.url ??
        listing?.listing_url ??
        listing?.url_full ??
        listing?.permalink ??
        null;

    return {
        marketplace: 'etsy',
        external_id: id != null ? String(id) : null,
        title,
        price,
        currency,
        listing_url: url,
        raw: listing
    };
}

async function searchEtsy(search) {
    const keywords = buildKeywords(search);
    if (!keywords) return [];

    // Match your GoSnaggit conventions: cap per call
    const limit = 50;

    const json = await fetchEtsyListings({ keywords, limit, offset: 0 });
    const rows = extractResults(json)
        .map(toNormalizedListing)
        .filter(r => r.external_id && r.title && r.listing_url);

    return rows;
}

module.exports = { searchEtsy };
