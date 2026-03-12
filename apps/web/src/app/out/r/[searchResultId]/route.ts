import { NextResponse } from "next/server";
import { getSearchResultById } from "@gosnaggit/core";

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

    return NextResponse.redirect(row.listingUrl);
}