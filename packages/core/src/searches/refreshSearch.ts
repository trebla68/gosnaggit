import { db, results } from "@gosnaggit/db";
import { and, eq } from "drizzle-orm";
import { SearchRow } from "./types";

function toMarketplaceRecord(value: unknown): Record<string, boolean> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const normalized: Record<string, boolean> = {};

    for (const [key, val] of entries) {
        normalized[key] = Boolean(val);
    }

    return normalized;
}

function buildDeterministicExternalId(searchId: number, marketplace: string) {
    return `mock-${marketplace}-${searchId}`;
}

export async function refreshSearch(search: SearchRow) {
    const marketplaceRecord = toMarketplaceRecord(search.marketplaces);

    const marketplaces = marketplaceRecord
        ? Object.keys(marketplaceRecord).filter((key) => marketplaceRecord[key])
        : [];

    const marketplace = marketplaces[0] || "mock";
    const externalId = buildDeterministicExternalId(search.id, marketplace);

    console.log(
        `[core] refreshSearch #${search.id} "${search.searchItem}" | marketplaces=${marketplaces.join(",") || "none"}`
    );

    const existing = await db
        .select()
        .from(results)
        .where(
            and(
                eq(results.searchId, search.id),
                eq(results.marketplace, marketplace),
                eq(results.externalId, externalId)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        console.log(
            `[core] duplicate result skipped for search #${search.id} | marketplace=${marketplace} | externalId=${externalId}`
        );

        return {
            ok: true,
            searchId: search.id,
            refreshedAt: new Date(),
            marketplaces,
            insertedResultId: null,
            deduped: true,
        };
    }

    const inserted = await db
        .insert(results)
        .values({
            searchId: search.id,
            marketplace,
            externalId,
            title: `Mock result for ${search.searchItem}`,
            price: "$123.45",
            currency: "USD",
            priceNum: "123.45",
            shippingNum: "15.00",
            totalPrice: "138.45",
            listingUrl: `https://example.com/listing/${search.id}`,
            imageUrl: "https://example.com/image.jpg",
            location: search.location ?? "Unknown",
            condition: "Used",
            sellerUsername: "mock-seller",
            foundAt: new Date(),
        })
        .returning();

    const result = inserted[0];

    console.log(
        `[core] inserted mock result #${result.id} for search #${search.id}`
    );

    return {
        ok: true,
        searchId: search.id,
        refreshedAt: new Date(),
        marketplaces,
        insertedResultId: result.id,
        deduped: false,
    };
}