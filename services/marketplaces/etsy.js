// services/marketplaces/etsy.js

const ETSY_BASE_URL = 'https://api.etsy.com/v3/application';

function getEtsyApiKeyHeader() {
    const key = process.env.ETSY_KEYSTRING;
    const secret = process.env.ETSY_SHARED_SECRET;

    if (!key || !secret) {
        throw new Error('Missing ETSY_KEYSTRING or ETSY_SHARED_SECRET in .env');
    }

    // Etsy v3 expects "keystring:shared_secret" in x-api-key
    return `${key}:${secret}`;
}

function withTimeout(ms = 15000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return { controller, done: () => clearTimeout(t) };
}

function normalizeMoney(m) {
    // Etsy responses vary by endpoint/version; we handle a few common shapes.
    // Return { price: number|null, currency: string|null }
    if (!m) return { price: null, currency: null };

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
