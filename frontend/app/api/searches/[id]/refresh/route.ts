import { NextRequest } from "next/server";
import { proxy } from "../../../_proxy/proxy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return proxy(request, `/api/searches/${id}/refresh`, { method: "POST" });
}
