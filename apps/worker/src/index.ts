import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq, isNull, lte, or } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.resolve(__dirname, "../../../.env"),
});

const POLL_MS = 15000;
const REFRESH_MINUTES = 15;

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

async function runOnce() {
    const { db, searches } = await import("@gosnaggit/db");
    const { refreshSearch } = await import("@gosnaggit/core");

    const now = new Date();

    console.log(`[worker] checking for searches to refresh at ${now.toISOString()}`);

    const dueSearches = await db
        .select()
        .from(searches)
        .where(
            and(
                eq(searches.status, "active"),
                or(isNull(searches.nextRefreshAt), lte(searches.nextRefreshAt, now))
            )
        );

    if (dueSearches.length === 0) {
        console.log("[worker] no searches due");
        return;
    }

    console.log(`[worker] found ${dueSearches.length} search(es) due`);

    for (const search of dueSearches) {
        const nextRefreshAt = addMinutes(now, REFRESH_MINUTES);

        console.log(
            `[worker] processing search #${search.id}: ${search.searchItem} | marketplaces=${JSON.stringify(search.marketplaces)}`
        );

        await refreshSearch(search);

        await db
            .update(searches)
            .set({ nextRefreshAt })
            .where(eq(searches.id, search.id));

        console.log(
            `[worker] rescheduled search #${search.id} for ${nextRefreshAt.toISOString()}`
        );
    }
}

async function main() {
    console.log("GoSnaggit worker starting...");
    console.log(`[worker] poll interval: ${POLL_MS / 1000}s`);
    console.log(`[worker] refresh interval: ${REFRESH_MINUTES}m`);

    await runOnce();

    setInterval(async () => {
        try {
            await runOnce();
        } catch (err) {
            console.error("[worker] loop error:", err);
        }
    }, POLL_MS);
}

main().catch((err) => {
    console.error("Worker error:", err);
    process.exit(1);
});