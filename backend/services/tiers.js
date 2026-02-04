// services/tiers.js

function normalizeTier(tier) {
    const t = String(tier || '').toLowerCase();
    if (t === 'power') return 'power';
    if (t === 'pro') return 'pro';
    return 'free';
}

function refreshIntervalMinutesForTier(tier) {
    const t = normalizeTier(tier);
    if (t === 'power') return 15;
    if (t === 'pro') return 60;
    return 24 * 60; // free
}

// Keep dispatch frequent for good UX (same for all tiers for now)
function dispatchIntervalMinutesForTier(_tier) {
    return 5;
}

// Tier limits (MVP defaults)
function maxSearchesForTier(tier) {
    const t = normalizeTier(tier);
    if (t === 'power') return 100;
    if (t === 'pro') return 25;
    return 5; // free
}


module.exports = {
    normalizeTier,
    refreshIntervalMinutesForTier,
    dispatchIntervalMinutesForTier,
    maxSearchesForTier,
};

