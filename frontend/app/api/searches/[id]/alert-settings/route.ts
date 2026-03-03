import { NextRequest } from "next/server";
import { proxy } from "../../../_proxy/proxy";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxy(request, `/searches/${id}/alert-settings`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxy(request, `/searches/${id}/alert-settings`, { method: "POST" });
}