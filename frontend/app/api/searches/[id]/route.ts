import { NextRequest } from "next/server";
import { proxy } from "../../_proxy/proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return proxy(request, `/api/searches/${id}`);
}
