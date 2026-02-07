// services/schedule.js

const pool = require('../db');
const {
    normalizeTier,
    refreshIntervalMinutesForTier,
    dispatchIntervalMinutesForTier,
} = require('./tiers');

async function bumpNextRefreshAt(searchId, planTier) {
    const tier = normalizeTier(planTier);
    const mins = refreshIntervalMinutesForTier(tier);

    await pool.query(
        `UPDATE searches
     SET next_refresh_at = NOW() + ($2::int * INTERVAL '1 minute')
     WHERE id = $1`,
        [searchId, mins]
    );
}

async function bumpNextDispatchAt(searchId, planTier) {
    const tier = normalizeTier(planTier);
    const mins = dispatchIntervalMinutesForTier(tier);

    await pool.query(
        `UPDATE searches
     SET next_dispatch_at = NOW() + ($2::int * INTERVAL '1 minute')
     WHERE id = $1`,
        [searchId, mins]
    );
}

async function setTierAndReschedule(searchId, newTier) {
    const tier = normalizeTier(newTier);
    const refreshMins = refreshIntervalMinutesForTier(tier);
    const dispatchMins = dispatchIntervalMinutesForTier(tier);

    // When tier changes, reschedule from NOW so it takes effect immediately.
    await pool.query(
        `UPDATE searches
     SET plan_tier = $2,
         next_refresh_at = NOW() + ($3::int * INTERVAL '1 minute'),
         next_dispatch_at = NOW() + ($4::int * INTERVAL '1 minute')
     WHERE id = $1`,
        [searchId, tier, refreshMins, dispatchMins]
    );

    return tier;
}

module.exports = {
    bumpNextRefreshAt,
    bumpNextDispatchAt,
    setTierAndReschedule,
};
