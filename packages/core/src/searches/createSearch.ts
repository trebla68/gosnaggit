import { db, searches } from "@gosnaggit/db";
import { CreateSearchInput } from "./types";

function toDbMaxPrice(value: number | null | undefined) {
    if (value == null) return null;
    return value.toFixed(2);
}

export async function createSearch(input: CreateSearchInput, userId?: number) {
    if (!input.searchItem || input.searchItem.trim() === "") {
        throw new Error("searchItem is required");
    }

    const result = await db
        .insert(searches)
        .values({
            userId: userId ?? null,
            searchItem: input.searchItem.trim(),
            location: input.location ?? null,
            category: input.category ?? null,
            maxPrice: toDbMaxPrice(input.maxPrice),
            marketplaces: input.marketplaces ?? null,
        })
        .returning();

    return result[0];
}