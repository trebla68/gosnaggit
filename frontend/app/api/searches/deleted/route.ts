import { proxy } from "../../_proxy/proxy";

export async function GET(request: Request) {
  return proxy(request, "/api/searches/deleted");
}
