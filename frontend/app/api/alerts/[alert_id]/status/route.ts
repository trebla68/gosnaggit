import { NextRequest } from "next/server";
import { proxy } from "../../../_proxy/proxy";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ alert_id: string }> }
) {
  const { alert_id } = await context.params;

  return proxy(request, `/api/alerts/${alert_id}/status`);
}