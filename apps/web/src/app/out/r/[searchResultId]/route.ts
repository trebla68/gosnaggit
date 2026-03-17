import { NextResponse } from "next/server";
import { getSearchResultById } from "@gosnaggit/core";
import { clickEvents, db } from "@gosnaggit/db";

const EBAY_HOSTS = new Set([
    "www.ebay.com",
    "ebay.com",
    "www.ebay.ca",
    "ebay.ca",
    "www.ebay.co.uk",
    "ebay.co.uk",
    "www.ebay.de",
    "ebay.de",
    "www.ebay.com.au",
    "ebay.com.au",
]);

function buildCustomId(searchId: number | string | null | undefined) {
    if (searchId == null || searchId === "") return "gs-search-unknown";
    return `gs-search-${searchId}`;
}

function appendEbayAffiliateParams(
    rawUrl: string | null | undefined,
    searchId: number | string | null | undefined
) {
    if (!rawUrl) return null;

    const campaignId = process.env.EBAY_CAMPAIGN_ID?.trim();
    if (!campaignId) return rawUrl;

    try {
        const url = new URL(rawUrl);

        if (!EBAY_HOSTS.has(url.hostname.toLowerCase())) {
            return rawUrl;
        }

        url.searchParams.set("campid", campaignId);
        url.searchParams.set("customid", buildCustomId(searchId));

        const toolId = process.env.EBAY_TOOL_ID?.trim();
        if (toolId) {
            url.searchParams.set("toolid", toolId);
        }

        return url.toString();
    } catch {
        return rawUrl;
    }
}

function isLikelyAutomatedEmailClick(request: Request) {
    const method = request.method.toUpperCase();
    if (method !== "GET") return true;

    const purpose = (request.headers.get("purpose") || "").toLowerCase();
    const secPurpose = (request.headers.get("sec-purpose") || "").toLowerCase();
    const secFetchMode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
    const userAgent = (request.headers.get("user-agent") || "").toLowerCase();

    if (purpose.includes("prefetch")) return true;
    if (secPurpose.includes("prefetch")) return true;
    if (secFetchMode === "prefetch") return true;

    const knownScannerSignals = [
        "microsoft office",
        "microsoft outlook",
        "safelinks",
        "defender",
        "exchange",
        "googleimageproxy",
        "google-inspectiontool",
        "urlscan",
        "barracuda",
        "mimecast",
        "proofpoint",
        "trend micro",
        "symantec",
        "norton",
        "crawler",
        "spider",
        "bot",
    ];

    return knownScannerSignals.some((signal) => userAgent.includes(signal));
}

function buildRedirectResponse(redirectUrl: string) {
    const response = NextResponse.redirect(redirectUrl, { status: 302 });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
}

type RouteContext = {
    params: Promise<{
        searchResultId: string;
    }>;
};

async function resolveRedirectTarget(searchResultId: string) {
    const id = Number(searchResultId);

    if (!Number.isFinite(id)) {
        return { error: "invalid-id" as const };
    }

    const row = await getSearchResultById(id);

    if (!row || !row.listingUrl) {
        return { error: "not-found" as const };
    }

    const redirectUrl =
        row.marketplace?.toLowerCase() === "ebay"
            ? appendEbayAffiliateParams(row.listingUrl, row.searchId)
            : row.listingUrl;

    if (!redirectUrl) {
        return { error: "no-url" as const };
    }

    return {
        row,
        redirectUrl,
    };
}

export async function GET(request: Request, { params }: RouteContext) {
    const { searchResultId } = await params;
    const resolved = await resolveRedirectTarget(searchResultId);

    if ("error" in resolved) {
        if (resolved.error === "invalid-id") {
            return new NextResponse("Invalid search result id.", { status: 400 });
        }

        if (resolved.error === "not-found") {
            return new NextResponse("Listing not found.", { status: 404 });
        }

        return new NextResponse("Listing URL unavailable.", { status: 404 });
    }

    const { row, redirectUrl } = resolved;

    if (!isLikelyAutomatedEmailClick(request)) {
        try {
            await db.insert(clickEvents).values({
                searchResultId: row.searchResultId,
                searchId: row.searchId,
                listingId: row.listingId,
                marketplace: row.marketplace,
                destinationUrl: redirectUrl,
            });
        } catch (error) {
            console.error("[out/r] failed to log click", error);
        }
    }

    return buildRedirectResponse(redirectUrl);
}

export async function HEAD(_request: Request, { params }: RouteContext) {
    const { searchResultId } = await params;
    const resolved = await resolveRedirectTarget(searchResultId);

    if ("error" in resolved) {
        if (resolved.error === "invalid-id") {
            return new NextResponse(null, { status: 400 });
        }

        if (resolved.error === "not-found") {
            return new NextResponse(null, { status: 404 });
        }

        return new NextResponse(null, { status: 404 });
    }

    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
}