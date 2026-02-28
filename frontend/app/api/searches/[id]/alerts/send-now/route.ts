import { proxy } from "../../../../_proxy/proxy";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return proxy(request, `/api/searches/${params.id}/alerts/send-now`);
}