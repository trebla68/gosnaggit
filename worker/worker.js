// worker/worker.js
require('dotenv').config();

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

const WORKER_TICK_MS = envInt('WORKER_TICK_MS', 2000);
console.log(`[worker] WORKER_TICK_MS=${WORKER_TICK_MS}`);

const pool = require('../db');
const {
  workerId,
  sleep,
  ensureDispatchJobExists,
  enqueueRefreshJobsFromActiveSearches,
  claimJobs,
  heartbeatJob,
  finalizeJobSuccess,
  failJobAndRequeue,
  reaper,
  rescheduleDispatchJob,
} = require('../services/jobs');


const { refreshSearchNow } = require('../services/refresh');
const { dispatchAllEnabledEmailAlerts } = require('../services/dispatchAlerts');


const WID = workerId();
let shuttingDown = false;

function log(event, extra = {}) {
  console.log(JSON.stringify({
    t: new Date().toISOString(),
    event,
    wid: WID,
    ...extra,
  }));
}

async function acquireLeaderLock() {
  const key = envInt('WORKER_LEADER_LOCK_KEY', 931337);

  // Keep ONE client checked out for the lifetime of the worker
  const client = await pool.connect();
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [key]);

  if (!r.rows?.[0]?.ok) {
    client.release();
    return { ok: false, client: null };
  }

  return { ok: true, client };
}

async function releaseLeaderLock(client) {
  if (!client) return;
  try {
    const key = envInt('WORKER_LEADER_LOCK_KEY', 931337);
    await client.query('SELECT pg_advisory_unlock($1)', [key]);
  } catch (_) {
    // ignore
  } finally {
    try { client.release(); } catch (_) { }
  }
}

async function processRefreshJobs() {
  const leaseMinutes = 2;
  const batchSize = 3;

  const jobs = await claimJobs({ jobType: 'refresh', batchSize, workerId: WID, leaseMinutes });

  for (const job of jobs) {
    if (shuttingDown) return;

    log('job.start', { jobType: job.job_type, jobId: job.id, search_id: job.search_id });

    let hbOk = true;
    const hbIntervalMs = 30_000;

    const hbTimer = setInterval(async () => {
      try {
        const ok = await heartbeatJob({ jobId: job.id, workerId: WID, leaseMinutes });
        if (!ok) hbOk = false;
      } catch (_) {
        hbOk = false;
      }
    }, hbIntervalMs);

    try {
      const result = await refreshSearchNow({ searchId: Number(job.search_id) });

      clearInterval(hbTimer);

      if (!hbOk) {
        log('job.lease_lost', { jobId: job.id });
        continue;
      }

      const finalized = await finalizeJobSuccess({ jobId: job.id, workerId: WID });
      log('job.ok', { jobId: job.id, finalized, result });
    } catch (e) {
      clearInterval(hbTimer);

      const msg = String(e?.stack || e?.message || e).slice(0, 2000);
      log('job.fail', { jobId: job.id, error: msg });

      await failJobAndRequeue({ job, workerId: WID, errorMessage: msg, retryCap: 5 });
    }
  }
}

async function processDispatchJobs() {
  const leaseMinutes = 2;
  const batchSize = 1;

  const jobs = await claimJobs({ jobType: 'dispatch', batchSize, workerId: WID, leaseMinutes });

  for (const job of jobs) {
    if (shuttingDown) return;

    // heartbeat to keep lease alive
    let hbOk = true;
    const hbIntervalMs = 30_000;
    const hbTimer = setInterval(async () => {
      try {
        const ok = await heartbeatJob({ jobId: job.id, workerId: WID, extendMinutes: leaseMinutes });
        if (!ok) hbOk = false;
      } catch (_) {
        hbOk = false;
      }
    }, hbIntervalMs);

    try {
      const limitPerSearch = envInt('DISPATCH_LIMIT_PER_SEARCH', 25);
      const result = await dispatchAllEnabledEmailAlerts({ pool, limitPerSearch });

      clearInterval(hbTimer);

      if (!hbOk) {
        log('job.lease_lost', { jobId: job.id });
        continue;
      }

      const finalized = await finalizeJobSuccess({ jobId: job.id, workerId: WID, result });
      if (!finalized) {
        log('job.finalize_failed', { jobId: job.id });
        continue;
      }

      // Keep the “one circulating dispatch job” behavior going
      await rescheduleDispatchJob();
      log('dispatch.ok', { jobId: job.id, ...result });
    } catch (err) {
      clearInterval(hbTimer);
      const msg = err && err.message ? err.message : String(err);
      await failJobAndRequeue({ job, workerId: WID, errorMessage: msg, retryCap: 10 });
      log('dispatch.error', { jobId: job.id, error: msg });
    }
  }
}


async function main() {
  log('worker.start');

  // Leader lock: only one worker instance runs
  const leader = await acquireLeaderLock();
  if (!leader.ok) {
    log('worker.not_leader_exit');
    process.exit(0);
  }
  log('worker.leader_acquired');

  const shutdown = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('worker.shutdown_begin', { sig });

    await releaseLeaderLock(leader.client);

    try { await pool.end(); } catch (_) { }
    log('worker.shutdown_done');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Ensures “one circulating dispatch job” behavior (if your jobs.js supports it)
  await ensureDispatchJobExists();

  let loopBackoffMs = 0;

  while (!shuttingDown) {
    try {
      // enqueue refresh jobs for active searches
      await enqueueRefreshJobsFromActiveSearches();

      // work the queue
      await processRefreshJobs();
      await processDispatchJobs();


      // clean up expired leases
      await reaper({ workerId: WID, leaseMinutes: 2, scanLimit: 50 });

      loopBackoffMs = 0;
      await sleep(WORKER_TICK_MS);
    } catch (e) {
      loopBackoffMs = Math.min(10_000, loopBackoffMs ? loopBackoffMs * 2 : 500);
      log('worker.loop_error', { backoffMs: loopBackoffMs, error: String(e?.message || e) });
      await sleep(loopBackoffMs);
    }
  }
}

main().catch((e) => {
  console.error('worker.fatal', e);
  process.exit(1);
});
