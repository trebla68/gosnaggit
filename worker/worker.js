// worker/worker.js
require('dotenv').config();

const pool = require('../db'); // uses your existing db.js
const { tryLock, unlock } = require('./lib/lock');
const { httpJson } = require('./lib/http');

const { dispatchAllEnabledEmailAlerts } = require('../services/dispatchAlerts');


const BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:3000';

// How often to run each loop
const REFRESH_EVERY_SECONDS = Number(process.env.WORKER_REFRESH_EVERY_SECONDS || 300);  // 5 min
const DISPATCH_EVERY_SECONDS = Number(process.env.WORKER_DISPATCH_EVERY_SECONDS || 60); // 1 min

// How many searches to process per cycle (prevents runaway loops)
const MAX_SEARCHES_PER_CYCLE = Number(process.env.WORKER_MAX_SEARCHES_PER_CYCLE || 50);

// How many alerts to dispatch per search per cycle (if your endpoint supports limit=)
const DISPATCH_LIMIT = Number(process.env.WORKER_DISPATCH_LIMIT || 50);

function ts() {
    return new Date().toISOString();
}

async function getActiveSearchIds() {
    // tolerant of different status casing
    const sql = `
    SELECT id
    FROM searches
    WHERE COALESCE(LOWER(status), 'active') = 'active'
    ORDER BY id ASC
    LIMIT $1
  `;
    const { rows } = await pool.query(sql, [MAX_SEARCHES_PER_CYCLE]);
    return rows.map(r => r.id);
}

async function callRefresh(searchId) {
    // We try /api first, then fallback to non-/api, because your code has used both styles historically.
    const urlsToTry = [
        `${BASE_URL}/api/searches/${searchId}/refresh`,
        `${BASE_URL}/searches/${searchId}/refresh`,
    ];

    for (const url of urlsToTry) {
        const r = await httpJson(url, { method: 'POST' });
        if (r.status !== 404) return { url, ...r };
    }
    return { ok: false, status: 404, data: { error: 'Refresh route not found (tried /api and non-/api)' } };
}


async function refreshCycle() {
    const lockName = 'gosnaggit:refreshCycle';
    const got = await tryLock(pool, lockName);
    if (!got) {
        console.log(`[${ts()}] refreshCycle: skipped (lock held)`);
        return;
    }

    try {
        const ids = await getActiveSearchIds();
        console.log(`[${ts()}] refreshCycle: active searches=${ids.length}`);

        for (const id of ids) {
            const r = await callRefresh(id);
            if (!r.ok) {
                console.log(`[${ts()}] refreshCycle: search=${id} FAIL status=${r.status} via=${r.url} data=`, r.data);
            } else {
                console.log(`[${ts()}] refreshCycle: search=${id} OK via=${r.url} data=`, r.data);
            }
        }
    } catch (err) {
        console.log(`[${ts()}] refreshCycle: ERROR`, err);
    } finally {
        await unlock(pool, lockName);
    }
}

async function dispatchCycle() {
    const lockName = 'gosnaggit:dispatchCycle';
    const got = await tryLock(pool, lockName);
    if (!got) {
        console.log(`[${ts()}] dispatchCycle: skipped (lock held)`);
        return;
    }

    try {
        const totals = await dispatchAllEnabledEmailAlerts({
            pool,
            limitPerSearch: DISPATCH_LIMIT,
        });

        console.log(`[${ts()}] dispatchCycle: totals=`, totals);
    } catch (err) {
        console.log(`[${ts()}] dispatchCycle: ERROR`, err);
    } finally {
        await unlock(pool, lockName);
    }
}


function everySeconds(fn, seconds) {
    // run once immediately, then on an interval
    fn().catch(() => { });
    return setInterval(() => fn().catch(() => { }), Math.max(5, seconds) * 1000);
}

async function main() {
    console.log(`[${ts()}] GoSnaggit worker starting`);
    console.log(`[${ts()}] BASE_URL=${BASE_URL}`);
    console.log(`[${ts()}] refresh every ${REFRESH_EVERY_SECONDS}s, dispatch every ${DISPATCH_EVERY_SECONDS}s`);

    everySeconds(refreshCycle, REFRESH_EVERY_SECONDS);
    everySeconds(dispatchCycle, DISPATCH_EVERY_SECONDS);

    // keep process alive
}

main().catch(err => {
    console.error('Worker fatal error:', err);
    process.exit(1);
});
