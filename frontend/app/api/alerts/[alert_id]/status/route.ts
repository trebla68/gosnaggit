import { proxy } from "../../../_proxy/proxy";

export async function PATCH(request: Request, { params }: { params: { alert_id: string } }) {
  return proxy(request, `/api/alerts/${params.alert_id}/status`);
}
