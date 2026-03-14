import { NextResponse } from "next/server";
import { getRecentClickEvents } from "@gosnaggit/core";

export async function GET() {
    const rows = await getRecentClickEvents(100);
    return NextResponse.json({ ok: true, clicks: rows });
}