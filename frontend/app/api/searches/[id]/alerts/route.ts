import { NextRequest } from "next/server";
import { proxy } from "../../../_proxy/proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxy(request, `/api/searches/${id}/alerts`);
}