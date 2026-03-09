import { db, searches } from "@gosnaggit/db";
import { CreateSearchInput } from "./types";

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
            maxPrice: input.maxPrice ?? null,
            marketplaces: input.marketplaces ?? null,
        })
        .returning();

    return result[0];
}