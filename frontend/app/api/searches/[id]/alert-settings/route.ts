import { proxy } from "../../../_proxy/proxy";

export async function GET(request: Request, { params }: { params: { id: string } }) {
    return proxy(request, `/searches/${params.id}/alert-settings`);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
    return proxy(request, `/searches/${params.id}/alert-settings`, { method: "POST" });
}
