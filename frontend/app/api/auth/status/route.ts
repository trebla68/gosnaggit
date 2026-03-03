import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
    const jar = cookies();
    const hasAuth = Boolean(jar.get("gs_auth")?.value);
    return NextResponse.json({ ok: true, loggedIn: hasAuth });
}