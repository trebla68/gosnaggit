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
        return Array.isArray(out) ? out : [];
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.warn(`[marketplaces] ${name} failed (fail-soft): ${msg}`);
        return [];
    }
}

// --------------------
// Marketplace runner
// --------------------

async function runMarketplaceSearches(search) {
    const results = [];
    const ran = [];
    const skipped = [];

    // eBay: default ON unless explicitly disabled with MARKETPLACE_EBAY=false
    const ebayEnabled = !isDisabledFalse('MARKETPLACE_EBAY');
    if (ebayEnabled) {
        const ebayResults = await safeRun('ebay', () => searchEbay(search));
        results.push(...ebayResults);
        ran.push('ebay');
    } else {
        skipped.push('ebay(env)');
    }

    // Etsy: only ON when MARKETPLACE_ETSY=true
    const etsyEnabled = boolEnv('MARKETPLACE_ETSY', false);
    if (!etsyEnabled) {
        skipped.push('etsy(env)');
    } else if (inCooldown('etsy')) {
        skipped.push('etsy(cooldown)');
    } else {
        // Etsy is special: if it fails (common while key is pending), we cooldown for 30 minutes
        try {
            const etsyResults = await searchEtsy(search);
            results.push(...(Array.isArray(etsyResults) ? etsyResults : []));
            ran.push('etsy');
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            console.warn(`[marketplaces] etsy failed (fail-soft): ${msg}`);

            // Cooldown: 30 minutes (reduces spam while key is unapproved)
            setCooldown('etsy', 30 * 60 * 1000);

            // Also log a friendlier line, but not more than once every 5 minutes
            logOnceEvery(
                'etsy',
                5 * 60 * 1000,
                `[marketplaces] etsy is in cooldown for 30m after failure (likely key pending/endpoint unavailable)`
            );

            skipped.push('etsy(failed→cooldown)');
        }
    }

    // Facebook: only ON when MARKETPLACE_FACEBOOK=true (and module exists)
    const fbEnabled = boolEnv('MARKETPLACE_FACEBOOK', false);
    if (!fbEnabled) {
        skipped.push('facebook(env)');
    } else {
        // If you later add services/marketplaces/facebook.js, uncomment the require at top.
        // const fbResults = await safeRun('facebook', () => searchFacebook(search));
        // results.push(...fbResults);
        // ran.push('facebook');
        skipped.push('facebook(not-wired)');
    }

    // Craigslist: only ON when MARKETPLACE_CRAIGSLIST=true (and module exists)
    const clEnabled = boolEnv('MARKETPLACE_CRAIGSLIST', false);
    if (!clEnabled) {
        skipped.push('craigslist(env)');
    } else {
        // If you later add services/marketplaces/craigslist.js, uncomment the require at top.
        // const clResults = await safeRun('craigslist', () => searchCraigslist(search));
        // results.push(...clResults);
        // ran.push('craigslist');
        skipped.push('craigslist(not-wired)');
    }

    // One summary line per refresh call
    console.log(
        `[marketplaces] ran=${ran.length ? ran.join(',') : 'none'} skipped=${skipped.length ? skipped.join(',') : 'none'} total=${results.length}`
    );

    return results;
}

module.exports = {
    runMarketplaceSearches,
};
