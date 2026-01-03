// worker.js
require("dotenv").config();
const pool = require("./db");

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
} = require("./services/jobs");

const { refreshSearch } = require("./services/refresh");
const { dispatchAllEnabledEmailAlerts } = require("./services/dispatchAlerts");




try {
    // If you already have these modules, wire them here:
    // refreshSearch = require("./services/refresh").refreshSearch;
    // dispatchPendingAlerts = require("./services/alerts").dispatchPendingAlerts;
} catch (e) {
    // We'll handle missing wiring below.
}

const LEASE_MINUTES = 10;      // per your decision
const HEARTBEAT_EVERY_MS = 60_000;
const REFRESH_BATCH = 3;
const DISPATCH_BATCH = 50;

async function runRefreshJob(job, wid) {
    if (typeof refreshSearch !== "function") {
        throw new Error("refreshSearch is not wired yet (create services/refresh.js or point to your existing refresh function).");
    }

    let alive = true;
    const hb = setInterval(async () => {
        if (!alive) return;
        const ok = await heartbeatJob({ jobId: job.id, workerId: wid, leaseMinutes: LEASE_MINUTES });
        if (!ok) {
            alive = false;
            console.error(`Lost lease for refresh job ${job.id}; stopping (strict mode).`);
        }
    }, HEARTBEAT_EVERY_MS);

    try {
        await refreshSearch(job.search_id, { job_id: job.id });
        if (!alive) throw new Error("Lease lost during refresh (strict mode abort).");

        const finalized = await finalizeJobSuccess({ jobId: job.id, workerId: wid });
        if (!finalized) throw new Error("Failed to finalize refresh job (lease expired or stolen).");
    } finally {
        clearInterval(hb);
        alive = false;
    }
}

async function runDispatchJob(job, wid) {
    let alive = true;
    const hb = setInterval(async () => {
        if (!alive) return;
        const ok = await heartbeatJob({
            jobId: job.id,
            workerId: wid,
            leaseMinutes: LEASE_MINUTES,
        });
        if (!ok) {
            alive = false;
            console.error(`Lost lease for dispatch job ${job.id}; stopping.`);
        }
    }, HEARTBEAT_EVERY_MS);

    try {
        await dispatchAllEnabledEmailAlerts({
            pool,
            limitPerSearch: DISPATCH_BATCH,
        });

        if (!alive) throw new Error("Lease lost during dispatch");

        const finalized = await finalizeJobSuccess({
            jobId: job.id,
            workerId: wid,
        });

        if (!finalized) {
            throw new Error("Failed to finalize dispatch job");
        }

        await rescheduleDispatchJob();
    } finally {
        clearInterval(hb);
        alive = false;
    }
}


async function main() {
    const wid = workerId();
    console.log("GoSnaggit worker starting:", wid);

    // Basic DB ping
    await pool.query("SELECT 1");

    await ensureDispatchJobExists();

    while (true) {
        try {
            // 1) Reaper: clean up expired leases
            await reaper({ workerId: wid, leaseMinutes: LEASE_MINUTES, scanLimit: 50 });

            // 2) Ensure refresh jobs exist for active searches
            await enqueueRefreshJobsFromActiveSearches();

            // 3) Claim + run refresh jobs
            const refreshJobs = await claimJobs({ jobType: "refresh", batchSize: REFRESH_BATCH, workerId: wid, leaseMinutes: LEASE_MINUTES });
            for (const job of refreshJobs) {
                try {
                    await runRefreshJob(job, wid);
                    console.log(`refresh job ${job.id} succeeded (search ${job.search_id})`);
                } catch (e) {
                    console.error(`refresh job ${job.id} error:`, e.message);
                    await failJobAndRequeue({ job, workerId: wid, errorMessage: e.message, retryCap: 5 });
                }
            }

            // 4) Claim + run a dispatch job (just 1 at a time)
            const dispatchJobs = await claimJobs({ jobType: "dispatch", batchSize: 1, workerId: wid, leaseMinutes: LEASE_MINUTES });
            for (const job of dispatchJobs) {
                try {
                    await runDispatchJob(job, wid);
                    console.log(`dispatch job ${job.id} succeeded`);
                } catch (e) {
                    console.error(`dispatch job ${job.id} error:`, e.message);
                    await failJobAndRequeue({ job, workerId: wid, errorMessage: e.message, retryCap: 5 });
                }
            }

        } catch (e) {
            console.error("Worker loop error:", e);
        }

        // small sleep to avoid hammering DB
        await sleep(2000);
    }
}

main().catch((e) => {
    console.error("Worker fatal error:", e);
    process.exit(1);
});
