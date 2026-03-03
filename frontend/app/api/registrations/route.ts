import { proxy } from "../_proxy/proxy";

export async function POST(request: Request) {
    return proxy(request, "/api/registrations");
}
