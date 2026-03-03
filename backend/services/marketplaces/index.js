// services/marketplaces/index.js

const { searchEbay } = require('./ebay');
const { searchEtsy } = require('./etsy');

// Optional: only require these if/when you actually create them.
// If you don't have these files yet, leave these requires commented out.
// const { searchFacebook } = require('./facebook');
// const { searchCraigslist } = require('./craigslist');

// --------------------
// Fail-soft + cooldown
// --------------------

const cooldowns = {
    etsy: { until: 0, lastMsgAt: 0 },
};

function nowMs() {
    return Date.now();
}

function boolEnv(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') return fallback;
    return String(v).toLowerCase() === 'true';
}

function isDisabledFalse(name) {
    // supports old pattern where "false" disables; otherwise enabled
    return String(process.env[name] || '').toLowerCase() === 'false';
}

function setCooldown(name, ms) {
    if (!cooldowns[name]) cooldowns[name] = { until: 0, lastMsgAt: 0 };
    cooldowns[name].until = nowMs() + ms;
}

function inCooldown(name) {
    const c = cooldowns[name];
    return c && nowMs() < c.until;
}

function logOnceEvery(name, ms, message) {
    if (!cooldowns[name]) cooldowns[name] = { until: 0, lastMsgAt: 0 };
    const c = cooldowns[name];
    if (nowMs() - c.lastMsgAt > ms) {
        c.lastMsgAt = nowMs();
        console.warn(message);
    }
}

async function safeRun(name, fn) {
    try {
        const out = await fn();
        const items = Array.isArray(out) ? out : [];
        return { ok: true, items, error: null };
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.warn(`[marketplaces] ${name} failed (fail-soft): ${msg}`);
        return { ok: false, items: [], error: msg };
    }
}


// --------------------
// Marketplace runner
// --------------------

async function runMarketplaceSearches(search) {
    const results = [];
    const marketplaces = {};

    // Per-search selection (DB column). If missing, treat as default.
    const sel = (search && search.marketplaces && typeof search.marketplaces === 'object')
        ? search.marketplaces
        : { ebay: true, etsy: false, facebook: false, craigslist: false };

    // Global env “hard off” switches still win
    const envAllows = (key) => process.env[`MARKETPLACE_${key.toUpperCase()}`] !== 'false';
    const want = (key) => !!sel[key];

    // eBay
    if (want('ebay') && envAllows('ebay')) {
        const r = await safeRun('ebay', () => searchEbay(search));
        results.push(...r.items);
        marketplaces.ebay = { enabled: true, selected: true, ran: true, ok: r.ok, count: r.items.length, error: r.error };
    } else {
        marketplaces.ebay = { enabled: envAllows('ebay'), selected: want('ebay'), ran: false, skipped: true };
    }

    // Etsy
    if (want('etsy') && envAllows('etsy')) {
        const r = await safeRun('etsy', () => searchEtsy(search));
        results.push(...r.items);
        marketplaces.etsy = { enabled: true, selected: true, ran: true, ok: r.ok, count: r.items.length, error: r.error };
    } else {
        marketplaces.etsy = { enabled: envAllows('etsy'), selected: want('etsy'), ran: false, skipped: true };
    }

    // Future placeholders
    if (want('facebook') && envAllows('facebook')) {
        marketplaces.facebook = { enabled: true, selected: true, ran: false, skipped: true, note: "not implemented" };
        // const r = await safeRun('facebook', () => searchFacebook(search));
        // results.push(...r.items);
        // marketplaces.facebook = { enabled: true, selected: true, ran: true, ok: r.ok, count: r.items.length, error: r.error };
    } else {
        marketplaces.facebook = { enabled: envAllows('facebook'), selected: want('facebook'), ran: false, skipped: true };
    }

    if (want('craigslist') && envAllows('craigslist')) {
        marketplaces.craigslist = { enabled: true, selected: true, ran: false, skipped: true, note: "not implemented" };
        // const r = await safeRun('craigslist', () => searchCraigslist(search));
        // results.push(...r.items);
        // marketplaces.craigslist = { enabled: true, selected: true, ran: true, ok: r.ok, count: r.items.length, error: r.error };
    } else {
        marketplaces.craigslist = { enabled: envAllows('craigslist'), selected: want('craigslist'), ran: false, skipped: true };
    }

    return { results, marketplaces };
}


module.exports = {
    runMarketplaceSearches
};

