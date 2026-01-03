// services/scheduler.js

const pool = require('../db');
const { dispatchAllEnabledEmailAlerts } = require('./dispatchAlerts');

let timer = null;
let running = false;

function startScheduler({ intervalMs = 60_000 } = {}) {
    if (timer) return; // already started

    timer = setInterval(async () => {
        if (running) return; // prevent overlap
        running = true;

        try {
            const totals = await dispatchAllEnabledEmailAlerts({ pool, limitPerSearch: 25 });
            if (totals.dispatched > 0 || totals.error > 0) {
                console.log('[scheduler] auto-dispatch:', totals);
            }
        } catch (err) {
            console.error('[scheduler] auto-dispatch failed:', err);
        } finally {
            running = false;
        }
    }, intervalMs);

    console.log(`[scheduler] started (intervalMs=${intervalMs})`);
}

module.exports = { startScheduler };
