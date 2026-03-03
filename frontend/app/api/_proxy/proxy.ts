import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.API_BASE_URL || "http://127.0.0.1:3000";

function getCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export async function proxy(request: Request, backendPath: string, init?: RequestInit) {
  const url = new URL(request.url);
  const target = new URL(backendPath, BACKEND);

  // copy querystring
  target.search = url.search;

  const method = init?.method || request.method;

  const headers = new Headers(init?.headers || {});
  // Forward member auth + trial access cookies to the backend
  const cookieHeader = request.headers.get("cookie") || "";

  const authToken = getCookieValue(cookieHeader, "gs_auth");
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);

  const trialToken = getCookieValue(cookieHeader, "gs_trial");
  if (trialToken) headers.set("x-gs-trial", trialToken);
  // forward json body when present
  let body: any = undefined;
  if (method !== "GET" && method !== "HEAD") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await request.json().catch(() => null);
      body = json ? JSON.stringify(json) : undefined;
      headers.set("content-type", "application/json");
    } else {
      // fallback raw
      body = await request.text().catch(() => undefined);
    }
  }

  const res = await fetch(target.toString(), {
    method,
    headers,
    body,
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") || "application/json";
  const dataText = await res.text();

  const trialFromBackend = res.headers.get("x-gs-trial-token");

  const out = new NextResponse(dataText, {
    status: res.status,
    headers: {
      "content-type": contentType,
    },
  });

  if (trialFromBackend) {
    out.cookies.set("gs_trial", trialFromBackend, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
    });
  }

  return out;
}
