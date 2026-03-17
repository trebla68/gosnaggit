import { NextResponse } from "next/server";
import { createSearch } from "@gosnaggit/core";
import { db, notificationSettings } from "@gosnaggit/db";

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const searchItem =
            typeof body?.searchItem === "string" ? body.searchItem.trim() : "";
        const location =
            typeof body?.location === "string" ? body.location.trim() : "";
        const category =
            typeof body?.category === "string" ? body.category.trim() : "";
        const email =
            typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        const rawMaxPrice =
            typeof body?.maxPrice === "string" ? body.maxPrice.trim() : "";

        if (!searchItem) {
            return NextResponse.json(
                { ok: false, error: "Search item is required." },
                { status: 400 }
            );
        }

        if (!email || !isValidEmail(email)) {
            return NextResponse.json(
                { ok: false, error: "A valid alert email is required." },
                { status: 400 }
            );
        }

        let maxPrice: number | null = null;
        if (rawMaxPrice) {
            const parsed = Number(rawMaxPrice);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return NextResponse.json(
                    { ok: false, error: "Max price must be a valid number." },
                    { status: 400 }
                );
            }
            maxPrice = parsed;
        }

        const search = await createSearch({
            searchItem,
            location: location || null,
            category: category || null,
            maxPrice,
            marketplaces: { ebay: true },
        });

        await db.insert(notificationSettings).values({
            searchId: search.id,
            channel: "email",
            destination: email,
            isEnabled: true,
        });

        return NextResponse.json({
            ok: true,
            search: {
                id: search.id,
                searchItem: search.searchItem,
            },
        });
    } catch (error) {
        console.error("[api/searches] failed to create search", error);

        return NextResponse.json(
            { ok: false, error: "Failed to create search." },
            { status: 500 }
        );
    }
}
