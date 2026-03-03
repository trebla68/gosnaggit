import { proxy } from "../_proxy/proxy";

export async function GET(request: Request) {
  return proxy(request, "/api/searches");
}

export async function POST(request: Request) {
  return proxy(request, "/api/searches");
}
