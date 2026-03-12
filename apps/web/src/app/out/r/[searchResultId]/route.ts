import { NextResponse } from "next/server";
import { getSearchResultById } from "@gosnaggit/core";

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

type RouteContext = {
    params: Promise<{
        searchResultId: string;
    }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
    const { searchResultId } = await params;
    const id = Number(searchResultId);

    if (!Number.isFinite(id)) {
        return new NextResponse("Invalid search result id.", { status: 400 });
    }

    const row = await getSearchResultById(id);

    if (!row || !row.listingUrl) {
        return new NextResponse("Listing not found.", { status: 404 });
    }

    const redirectUrl =
        row.marketplace?.toLowerCase() === "ebay"
            ? appendEbayAffiliateParams(row.listingUrl, row.searchId)
            : row.listingUrl;

    if (!redirectUrl) {
        return new NextResponse("Listing URL unavailable.", { status: 404 });
    }

    return NextResponse.redirect(redirectUrl);
}