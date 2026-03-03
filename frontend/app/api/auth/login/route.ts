import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.API_BASE_URL || "http://127.0.0.1:3000";

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));

    const res = await fetch(new URL("/api/auth/login", BACKEND), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const text = await res.text();
    const out = new NextResponse(text, {
        status: res.status,
        headers: { "content-type": "application/json" },
    });

    if (res.ok) {
        const data = JSON.parse(text);
        if (data?.token) {
            out.cookies.set("gs_auth", data.token, {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 60 * 60 * 24 * 30, // 30 days
            });
        }
    }

    return out;
}