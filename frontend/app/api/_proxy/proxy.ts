import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.API_BASE_URL || "http://127.0.0.1:3000";

export async function proxy(request: Request, backendPath: string, init?: RequestInit) {
  const url = new URL(request.url);
  const target = new URL(backendPath, BACKEND);

  // copy querystring
  target.search = url.search;

  const method = init?.method || request.method;

  const headers = new Headers(init?.headers || {});

  // Forward client cookies/auth to backend (needed for sessions)
  const cookie = request.headers.get("cookie");
  if (cookie && !headers.has("cookie")) headers.set("cookie", cookie);

  const auth = request.headers.get("authorization");
  if (auth && !headers.has("authorization")) headers.set("authorization", auth);

  const xfwd = request.headers.get("x-forwarded-for");
  if (xfwd && !headers.has("x-forwarded-for")) headers.set("x-forwarded-for", xfwd);

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

  const outHeaders: Record<string, string> = { "content-type": contentType };
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) outHeaders["set-cookie"] = setCookie;

  return new NextResponse(dataText, {
    status: res.status,
    headers: outHeaders,
  });
}
