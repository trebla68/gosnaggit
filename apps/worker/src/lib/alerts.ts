import { sendSearchAlertEmail } from "@gosnaggit/email";
import {
    alerts,
    db,
    listings,
    notificationSettings,
    searchResults,
    searches,
    users,
} from "@gosnaggit/db";
import { and, desc, eq, inArray } from "drizzle-orm";

type PendingAlertRow = {
    alertId: number;
    searchResultId: number;
    searchItem: string;
    title: string | null;
    price: string | null;
    marketplace: string | null;
    location: string | null;
    imageUrl: string | null;
};

async function getEmailDestinationForSearch(searchId: number) {
    const notificationRows = await db
        .select({
            destination: notificationSettings.destination,
        })
        .from(notificationSettings)
        .where(
            and(
                eq(notificationSettings.searchId, searchId),
                eq(notificationSettings.channel, "email"),
                eq(notificationSettings.isEnabled, true)
            )
        )
        .limit(1);

    const notificationDestination = notificationRows[0]?.destination?.trim();
    if (notificationDestination) {
        return notificationDestination;
    }

    const userRows = await db
        .select({
            email: users.email,
        })
        .from(searches)
        .innerJoin(users, eq(searches.userId, users.id))
        .where(eq(searches.id, searchId))
        .limit(1);

    const userEmail = userRows[0]?.email?.trim();
    if (userEmail) {
        return userEmail;
    }

    return null;
}

async function queuePendingAlerts(searchId: number, searchResultIds: number[]) {
    const uniqueIds = [...new Set(searchResultIds.filter((id) => Number.isFinite(id)))];

    if (!uniqueIds.length) {
        return 0;
    }

    const existingRows = await db
        .select({
            searchResultId: alerts.searchResultId,
        })
        .from(alerts)
        .where(
            and(
                eq(alerts.searchId, searchId),
                inArray(alerts.searchResultId, uniqueIds)
            )
        );

    const existingIds = new Set(
        existingRows
            .map((row) => row.searchResultId)
            .filter((value): value is number => value != null)
    );

    const idsToInsert = uniqueIds.filter((id) => !existingIds.has(id));

    if (!idsToInsert.length) {
        return 0;
    }

    await db.insert(alerts).values(
        idsToInsert.map((searchResultId) => ({
            searchId,
            searchResultId,
            status: "pending",
        }))
    );

    return idsToInsert.length;
}

async function getPendingAlertsForSearch(searchId: number): Promise<PendingAlertRow[]> {
    const rows = await db
        .select({
            alertId: alerts.id,
            searchResultId: searchResults.id,
            searchItem: searches.searchItem,
            title: listings.title,
            price: listings.price,
            marketplace: listings.marketplace,
            location: listings.location,
            imageUrl: listings.imageUrl,
        })
        .from(alerts)
        .innerJoin(searchResults, eq(alerts.searchResultId, searchResults.id))
        .innerJoin(listings, eq(searchResults.listingId, listings.id))
        .innerJoin(searches, eq(alerts.searchId, searches.id))
        .where(
            and(
                eq(alerts.searchId, searchId),
                eq(alerts.status, "pending")
            )
        )
        .orderBy(desc(searchResults.foundAt));

    return rows;
}

async function markAlertsSent(alertIds: number[]) {
    if (!alertIds.length) {
        return;
    }

    await db
        .update(alerts)
        .set({
            status: "sent",
        })
        .where(inArray(alerts.id, alertIds));
}

export async function processAlertsForSearch(
    searchId: number,
    insertedResultIds: number[]
) {
    if (insertedResultIds.length) {
        const queuedCount = await queuePendingAlerts(searchId, insertedResultIds);

        if (queuedCount === 0) {
            console.log(`[worker] no new alert rows queued for search #${searchId}`);
        } else {
            console.log(`[worker] queued ${queuedCount} pending alert(s) for search #${searchId}`);
        }
    }

    const destination = await getEmailDestinationForSearch(searchId);

    if (!destination) {
        const pendingRows = await getPendingAlertsForSearch(searchId);

        if (pendingRows.length) {
            console.log(
                `[worker] search #${searchId} has no email destination; ${pendingRows.length} pending alert(s) remain queued`
            );
        }

        return;
    }

    const pendingRows = await getPendingAlertsForSearch(searchId);

    if (!pendingRows.length) {
        return;
    }

    const searchItem = pendingRows[0].searchItem;
    const items = pendingRows.slice(0, 10).map((row) => ({
        searchResultId: row.searchResultId,
        title: row.title,
        price: row.price,
        marketplace: row.marketplace,
        location: row.location,
        imageUrl: row.imageUrl,
    }));

    try {
        await sendSearchAlertEmail({
            to: destination,
            searchItem,
            items,
        });

        await markAlertsSent(pendingRows.map((row) => row.alertId));

        console.log(
            `[worker] sent ${pendingRows.length} alert(s) for search #${searchId} to ${destination}`
        );
    } catch (error) {
        console.error(
            `[worker] failed sending alert email for search #${searchId}`,
            error
        );
    }
}