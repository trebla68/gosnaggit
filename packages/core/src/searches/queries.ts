import { clickEvents, db, listings, searchResults, searches } from "@gosnaggit/db";
import { count, desc, eq, sql } from "drizzle-orm";

const listingSelect = {
    searchResultId: searchResults.id,
    foundAt: searchResults.foundAt,
    listingId: listings.id,
    marketplace: listings.marketplace,
    externalId: listings.externalId,
    title: listings.title,
    price: listings.price,
    currency: listings.currency,
    priceNum: listings.priceNum,
    shippingNum: listings.shippingNum,
    totalPrice: listings.totalPrice,
    listingUrl: listings.listingUrl,
    imageUrl: listings.imageUrl,
    location: listings.location,
    condition: listings.condition,
    sellerUsername: listings.sellerUsername,
    firstSeenAt: listings.firstSeenAt,
    lastSeenAt: listings.lastSeenAt,
};

const searchResultDetailSelect = {
    ...listingSelect,
    searchId: searchResults.searchId,
};

export async function getRecentSearchesWithCounts(limit = 20) {
    const rows = await db
        .select({
            id: searches.id,
            searchItem: searches.searchItem,
            location: searches.location,
            category: searches.category,
            maxPrice: searches.maxPrice,
            status: searches.status,
            planTier: searches.planTier,
            createdAt: searches.createdAt,
            nextRefreshAt: searches.nextRefreshAt,
            lastFoundAt: searches.lastFoundAt,
            listingCount: count(searchResults.id),
        })
        .from(searches)
        .leftJoin(searchResults, eq(searchResults.searchId, searches.id))
        .groupBy(
            searches.id,
            searches.searchItem,
            searches.location,
            searches.category,
            searches.maxPrice,
            searches.status,
            searches.planTier,
            searches.createdAt,
            searches.nextRefreshAt,
            searches.lastFoundAt
        )
        .orderBy(desc(searches.createdAt))
        .limit(limit);

    return rows;
}

export async function getListingsForSearch(searchId: number, limit = 50) {
    const rows = await db
        .select(listingSelect)
        .from(searchResults)
        .innerJoin(listings, eq(searchResults.listingId, listings.id))
        .where(eq(searchResults.searchId, searchId))
        .orderBy(desc(searchResults.foundAt))
        .limit(limit);

    return rows;
}

export async function getSearchById(searchId: number) {
    const rows = await db
        .select()
        .from(searches)
        .where(eq(searches.id, searchId))
        .limit(1);

    return rows[0] ?? null;
}

export async function getSearchResultById(searchResultId: number) {
    const rows = await db
        .select(searchResultDetailSelect)
        .from(searchResults)
        .innerJoin(listings, eq(searchResults.listingId, listings.id))
        .where(eq(searchResults.id, searchResultId))
        .limit(1);

    return rows[0] ?? null;
}

export async function getRecentClickEvents(limit = 50) {
    const rows = await db
        .select({
            id: clickEvents.id,
            searchResultId: clickEvents.searchResultId,
            searchId: clickEvents.searchId,
            listingId: clickEvents.listingId,
            marketplace: clickEvents.marketplace,
            destinationUrl: clickEvents.destinationUrl,
            createdAt: clickEvents.createdAt,
        })
        .from(clickEvents)
        .orderBy(desc(clickEvents.createdAt))
        .limit(limit);

    return rows;
}

export async function getClickEventSummary() {
    const totalRows = await db
        .select({
            value: count(clickEvents.id),
        })
        .from(clickEvents);

    const todayRows = await db
        .select({
            value: count(clickEvents.id),
        })
        .from(clickEvents)
        .where(sql`${clickEvents.createdAt} >= now() - interval '1 day'`);

    const weekRows = await db
        .select({
            value: count(clickEvents.id),
        })
        .from(clickEvents)
        .where(sql`${clickEvents.createdAt} >= now() - interval '7 days'`);

    const marketplaceRows = await db
        .select({
            marketplace: clickEvents.marketplace,
            clicks: count(clickEvents.id),
        })
        .from(clickEvents)
        .groupBy(clickEvents.marketplace)
        .orderBy(desc(count(clickEvents.id)))
        .limit(1);

    return {
        totalClicks: Number(totalRows[0]?.value ?? 0),
        clicksToday: Number(todayRows[0]?.value ?? 0),
        clicksLast7Days: Number(weekRows[0]?.value ?? 0),
        topMarketplace: marketplaceRows[0]?.marketplace ?? "—",
    };
}

export async function getTopSearchesByClicks(limit = 5) {
    const rows = await db
        .select({
            searchId: searches.id,
            searchItem: searches.searchItem,
            clicks: count(clickEvents.id),
        })
        .from(clickEvents)
        .leftJoin(searches, eq(clickEvents.searchId, searches.id))
        .groupBy(searches.id, searches.searchItem)
        .orderBy(desc(count(clickEvents.id)))
        .limit(limit);

    return rows;
}

export async function getSearchPerformance(limit = 10) {
    const rows = await db
        .select({
            searchId: searches.id,
            searchItem: searches.searchItem,
            resultCount: count(searchResults.id),
        })
        .from(searches)
        .leftJoin(searchResults, eq(searchResults.searchId, searches.id))
        .groupBy(searches.id, searches.searchItem)
        .orderBy(desc(searches.createdAt))
        .limit(limit);

    const clickRows = await db
        .select({
            searchId: clickEvents.searchId,
            clicks: count(clickEvents.id),
        })
        .from(clickEvents)
        .groupBy(clickEvents.searchId);

    const clickMap = new Map<number, number>();
    for (const row of clickRows) {
        if (row.searchId != null) {
            clickMap.set(row.searchId, Number(row.clicks ?? 0));
        }
    }

    return rows.map((row) => {
        const resultCount = Number(row.resultCount ?? 0);
        const clicks = clickMap.get(row.searchId) ?? 0;
        const ctr = resultCount > 0 ? (clicks / resultCount) * 100 : 0;

        return {
            searchId: row.searchId,
            searchItem: row.searchItem,
            resultCount,
            clicks,
            ctr: Number(ctr.toFixed(1)),
        };
    });
}