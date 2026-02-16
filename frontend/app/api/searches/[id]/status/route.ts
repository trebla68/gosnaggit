import { proxy } from "../../../_proxy/proxy";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    return proxy(request, `/api/searches/${params.id}/status`);
}
