// services/scheduler.js
const { runDueSearchesOnce } = require('./searchRunner');

function startScheduler({ intervalMs = 60_000 } = {}) {
    let timer = null;
    let running = false;

    async function tick() {
        if (running) return;
        running = true;
        try {
            await runDueSearchesOnce();
        } catch (err) {
            console.error('[scheduler] tick failed:', err);
        } finally {
            running = false;
        }
    }

    // run once quickly after boot, then on interval
    tick();
    timer = setInterval(tick, intervalMs);

    console.log(`[scheduler] started (every ${Math.round(intervalMs / 1000)}s)`);

    return () => {
        if (timer) clearInterval(timer);
        console.log('[scheduler] stopped');
    };
}

module.exports = { startScheduler };
