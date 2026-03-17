import { NextResponse } from "next/server";
import { getListingsForSearch } from "@gosnaggit/core";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
    const { id } = await params;
    const searchId = Number(id);

    if (!Number.isFinite(searchId)) {
        return NextResponse.json(
            { ok: false, error: "Invalid search id." },
            { status: 400 }
        );
    }

    const rows = await getListingsForSearch(searchId, 100);

    return NextResponse.json({
        ok: true,
        rows,
    });
}