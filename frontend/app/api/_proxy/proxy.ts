import { NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_URL ||
  process.env.API_BASE_URL ||
  "http://127.0.0.1:3000";

export async function proxy(request: Request, backendPath: string, init?: RequestInit) {
  const url = new URL(request.url);
  const target = new URL(backendPath, BACKEND);

  // preserve query string unless backendPath already contains one
  if (!target.search && url.search) target.search = url.search;

  const headers = new Headers(request.headers);

  // let fetch set these correctly
  headers.delete("host");
  headers.delete("content-length");

  const method = init?.method ?? request.method;

  // only forward a body when it makes sense
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : init?.body ?? (request as any).body ?? (await request.arrayBuffer().catch(() => undefined));

  const res = await fetch(target.toString(), {
    method,
    headers,
    body: body as any,
    redirect: "manual",
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");

  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}