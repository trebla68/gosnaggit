import { proxy } from "../../../../_proxy/proxy";

export async function POST(request: Request, { params }: { params: { id: string } }) {
    return proxy(request, `/searches/${params.id}/notifications/email`, { method: "POST" });
}
