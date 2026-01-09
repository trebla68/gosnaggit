// services/jobs.js
const crypto = require("crypto");
const pool = require("../db");
const { bumpNextRefreshAt } = require("./schedule");

function workerId() {
  const host = process.env.HOSTNAME || "local";
  const rnd = crypto.randomBytes(3).toString("hex");
  return `${host}-${process.pid}-${rnd}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  // attempt_count starts at 0; first retry should be attempt 1
  if (attempt <= 1) return 2 * 60 * 1000;   // +2 min
  if (attempt === 2) return 5 * 60 * 1000;  // +5 min
  if (attempt === 3) return 15 * 60 * 1000; // +15 min
  return 60 * 60 * 1000;                    // +60 min
}

async function ensureDispatchJobExists() {
  await pool.query(`
    INSERT INTO jobs (job_type, status, run_at)
    SELECT 'dispatch', 'queued', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM jobs WHERE job_type='dispatch' AND status IN ('queued','running')
    )
  `);
}

async function enqueueRefreshJobsFromActiveSearches() {
  // Tiered scheduling:
  // - Only enqueue refresh jobs for searches that are DUE (next_refresh_at <= NOW()).
  // - Avoid duplicates: do not enqueue if queued/running refresh already exists.
  // - After enqueueing, bump next_refresh_at forward based on plan_tier.

  const batchLimit = Number(process.env.REFRESH_DUE_BATCH_LIMIT || 25);

  // 1) Find due searches that don't already have a queued/running refresh job
  const { rows: due } = await pool.query(
    `
    SELECT s.id, s.plan_tier
    FROM searches s
    WHERE s.status = 'active'
      AND COALESCE(s.next_refresh_at, NOW()) <= NOW()
      AND NOT EXISTS (
        SELECT 1
        FROM jobs j
        WHERE j.job_type = 'refresh'
          AND j.search_id = s.id
          AND j.status IN ('queued', 'running')
      )
    ORDER BY COALESCE(s.next_refresh_at, NOW()) ASC, s.id ASC
    LIMIT $1
    `,
    [batchLimit]
  );

  if (!due.length) return;

  // 2) Enqueue jobs + bump schedule
  // (Leader lock means only one worker runs, but we still keep it safe & simple.)
  for (const s of due) {
    await pool.query(
      `
      INSERT INTO jobs (job_type, search_id, status, run_at)
      SELECT 'refresh', $1, 'queued', NOW()
      WHERE NOT EXISTS (
        SELECT 1
        FROM jobs
        WHERE job_type='refresh'
          AND search_id=$1
          AND status IN ('queued','running')
      )
      `,
      [s.id]
    );

    // Move the schedule forward so it won't enqueue again next tick
    await bumpNextRefreshAt(s.id, s.plan_tier);
  }
}



async function enqueueRefreshJobForSearch(searchId) {
  await pool.query(`
    INSERT INTO jobs (job_type, search_id, status, run_at)
    SELECT 'refresh', $1, 'queued', NOW()
    WHERE NOT EXISTS (
      SELECT 1
      FROM jobs
      WHERE job_type='refresh'
        AND search_id=$1
        AND status IN ('queued','running')
    )
  `, [searchId]);
}

async function enqueueDispatchJobForSearch(searchId) {
  await pool.query(`
    INSERT INTO jobs (job_type, search_id, status, run_at)
    VALUES ('dispatch', $1, 'queued', NOW())
  `, [searchId]);
}


async function claimJobs({ jobType, batchSize, workerId, leaseMinutes }) {
  // Atomic claim: pick queued jobs due now, set to running + lease fields.
  const sql = `
    WITH candidates AS (
      SELECT id
      FROM jobs
      WHERE status = 'queued'
        AND job_type = $1
        AND run_at <= NOW()
      ORDER BY run_at ASC, id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs j
    SET status = 'running',
        claimed_by = $3,
        claimed_at = NOW(),
        lease_expires_at = NOW() + ($4 || ' minutes')::interval,
        started_at = COALESCE(started_at, NOW())
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*;
  `;
  const { rows } = await pool.query(sql, [jobType, batchSize, workerId, String(leaseMinutes)]);
  return rows;
}

async function heartbeatJob({ jobId, workerId, leaseMinutes }) {
  // Strict-mode heartbeat: only extend lease if still owned.
  const sql = `
    UPDATE jobs
    SET lease_expires_at = NOW() + ($3 || ' minutes')::interval
    WHERE id = $1
      AND status = 'running'
      AND claimed_by = $2
      AND lease_expires_at > NOW()
    RETURNING id;
  `;
  const { rowCount } = await pool.query(sql, [jobId, workerId, String(leaseMinutes)]);
  return rowCount === 1;
}

async function finalizeJobSuccess({ jobId, workerId }) {
  // Strict mode: only finalize if lease still valid & owned.
  const sql = `
    UPDATE jobs
    SET status='succeeded',
        finished_at = NOW(),
        claimed_by = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL
    WHERE id = $1
      AND status='running'
      AND claimed_by = $2
      AND lease_expires_at > NOW()
    RETURNING id;
  `;
  const { rowCount } = await pool.query(sql, [jobId, workerId]);
  return rowCount === 1;
}

async function failJobAndRequeue({ job, workerId, errorMessage, retryCap = 5 }) {
  // Strict mode: only the current lease-holder can mark failed.
  // Then create a new queued job with backoff, unless capped.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const failSql = `
      UPDATE jobs
      SET status='failed',
          last_error=$3,
          finished_at=NOW(),
          claimed_by=NULL,
          claimed_at=NULL,
          lease_expires_at=NULL
      WHERE id=$1
        AND status='running'
        AND claimed_by=$2
        AND lease_expires_at > NOW()
      RETURNING id, attempt_count, job_type, search_id;
    `;
    const failed = await client.query(failSql, [job.id, workerId, errorMessage?.slice(0, 2000) || "Unknown error"]);
    if (failed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { finalized: false, requeued: false, reason: "Lease not owned/expired" };
    }

    const prev = failed.rows[0];
    const nextAttempt = (prev.attempt_count || 0) + 1;

    if (nextAttempt > retryCap) {
      await client.query("COMMIT");
      return { finalized: true, requeued: false, reason: "Retry cap reached" };
    }

    const delay = backoffMs(nextAttempt);
    const enqueueSql = `
      INSERT INTO jobs (job_type, search_id, status, run_at, attempt_count, last_error)
      VALUES ($1, $2, 'queued', NOW() + ($3 || ' milliseconds')::interval, $4, $5)
      RETURNING id;
    `;
    const enq = await client.query(enqueueSql, [
      prev.job_type,
      prev.search_id,
      String(delay),
      nextAttempt,
      `retry_after_failure_of_job_${job.id}`,
    ]);

    await client.query("COMMIT");
    return { finalized: true, requeued: true, next_job_id: enq.rows[0].id, next_attempt: nextAttempt, delay_ms: delay };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function reaper({ workerId, leaseMinutes, scanLimit = 50 }) {
  // Finds expired running jobs and re-queues them (new job) with backoff,
  // while marking the zombie job as failed (reason: lease expired).
  // Note: This is conservative; only reaps jobs with expired leases.
  const sql = `
    SELECT *
    FROM jobs
    WHERE status='running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= NOW()
    ORDER BY lease_expires_at ASC
    LIMIT $1;
  `;
  const { rows } = await pool.query(sql, [scanLimit]);
  for (const job of rows) {
    // We can't "finalize" under strict mode because no one owns it now;
    // so we mark it failed WITHOUT ownership requirement (special case).
    // Then enqueue a retry job with attempt+1 and backoff.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lock = await client.query(`SELECT id, attempt_count, job_type, search_id FROM jobs WHERE id=$1 FOR UPDATE`, [job.id]);
      if (lock.rowCount !== 1) { await client.query("ROLLBACK"); continue; }

      const current = lock.rows[0];

      // Mark zombie failed (no owner)
      await client.query(`
        UPDATE jobs
        SET status='failed',
            last_error=$2,
            finished_at=NOW(),
            claimed_by=NULL,
            claimed_at=NULL,
            lease_expires_at=NULL
        WHERE id=$1
          AND status='running'
          AND lease_expires_at <= NOW();
      `, [job.id, "lease_expired_reaped"]);

      const nextAttempt = (current.attempt_count || 0) + 1;
      const delay = backoffMs(nextAttempt);

      await client.query(`
        INSERT INTO jobs (job_type, search_id, status, run_at, attempt_count, last_error)
        VALUES ($1, $2, 'queued', NOW() + ($3 || ' milliseconds')::interval, $4, $5)
      `, [current.job_type, current.search_id, String(delay), nextAttempt, `retry_after_lease_expiry_of_job_${job.id}`]);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      // keep going; reaper should be resilient
      console.error("Reaper error for job", job.id, e);
    } finally {
      client.release();
    }
  }
}

async function rescheduleDispatchJob() {
  // Keep one dispatch job circulating
  // (If you prefer dispatch loop without jobs, we can remove this.)
  await pool.query(`
    INSERT INTO jobs (job_type, status, run_at)
    VALUES ('dispatch', 'queued', NOW() + interval '1 minute')
  `);
}

module.exports = {
  workerId,
  sleep,
  ensureDispatchJobExists,
  enqueueRefreshJobsFromActiveSearches,

  enqueueRefreshJobForSearch,
  enqueueDispatchJobForSearch,

  claimJobs,
  heartbeatJob,
  finalizeJobSuccess,
  failJobAndRequeue,
  reaper,
  rescheduleDispatchJob,
};
