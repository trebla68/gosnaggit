import { db, results } from "@gosnaggit/db";
import { searchMarketplace } from "@gosnaggit/marketplace";
import { and, eq } from "drizzle-orm";
import {
    MarketplaceName,
    RefreshSearchSummary,
    SearchRow,
} from "./types";

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

function toSupportedMarketplaceNames(
    marketplaces: string[]
): MarketplaceName[] {
    return marketplaces.filter(
        (name): name is MarketplaceName => name === "ebay"
    );
}

export async function refreshSearch(search: SearchRow) {
    const marketplaceRecord = toMarketplaceRecord(search.marketplaces);

    const enabledMarketplaces = marketplaceRecord
        ? Object.keys(marketplaceRecord).filter((key) => marketplaceRecord[key])
        : [];

    const marketplaces = toSupportedMarketplaceNames(enabledMarketplaces);

    console.log(
        `[core] refreshSearch #${search.id} "${search.searchItem}" | marketplaces=${marketplaces.join(",") || "none"
        }`
    );

    let inserted = 0;
    let skippedDuplicates = 0;
    let lastInsertedResultId: number | null = null;

    for (const marketplace of marketplaces) {
        const listings = await searchMarketplace({
            marketplace,
            searchId: search.id,
            searchItem: search.searchItem,
            location: search.location,
            category: search.category,
            maxPrice:
                typeof search.maxPrice === "number"
                    ? search.maxPrice
                    : typeof search.maxPrice === "string" && search.maxPrice.trim() !== ""
                        ? Number(search.maxPrice)
                        : null,
        });

        for (const listing of listings) {
            const existing = await db
                .select()
                .from(results)
                .where(
                    and(
                        eq(results.searchId, search.id),
                        eq(results.marketplace, listing.marketplace),
                        eq(results.externalId, listing.externalId)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                skippedDuplicates++;

                console.log(
                    `[core] duplicate result skipped for search #${search.id} | marketplace=${listing.marketplace} | externalId=${listing.externalId}`
                );

                continue;
            }

            const priceNum =
                typeof listing.price === "number" ? listing.price.toFixed(2) : null;
            const shippingNum =
                typeof listing.shippingPrice === "number"
                    ? listing.shippingPrice.toFixed(2)
                    : null;
            const totalPrice =
                typeof listing.price === "number"
                    ? (
                        listing.price +
                        (typeof listing.shippingPrice === "number" ? listing.shippingPrice : 0)
                    ).toFixed(2)
                    : null;

            const insertedRows = await db
                .insert(results)
                .values({
                    searchId: search.id,
                    marketplace: listing.marketplace,
                    externalId: listing.externalId,
                    title: listing.title,
                    price:
                        typeof listing.price === "number"
                            ? `$${listing.price.toFixed(2)}`
                            : null,
                    currency: listing.currency,
                    priceNum,
                    shippingNum,
                    totalPrice,
                    listingUrl: listing.url,
                    imageUrl: listing.imageUrl,
                    location: listing.location ?? search.location ?? "Unknown",
                    condition: listing.condition ?? "Unknown",
                    sellerUsername: listing.sellerName ?? "unknown-seller",
                    foundAt: listing.listedAt ?? new Date(),
                })
                .returning();

            const result = insertedRows[0];
            inserted++;
            lastInsertedResultId = result?.id ?? null;

            console.log(
                `[core] inserted result #${result.id} for search #${search.id} | marketplace=${listing.marketplace} | externalId=${listing.externalId}`
            );
        }
    }

    const summary: RefreshSearchSummary = {
        searchId: search.id,
        marketplacesTried: marketplaces,
        inserted,
        skippedDuplicates,
    };

    return {
        ok: true,
        searchId: search.id,
        refreshedAt: new Date(),
        marketplaces,
        insertedResultId: lastInsertedResultId,
        deduped: inserted === 0 && skippedDuplicates > 0,
        summary,
    };
}