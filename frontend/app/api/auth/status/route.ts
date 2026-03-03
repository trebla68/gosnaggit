import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const jar = await cookies();
  const hasAuth = Boolean(jar.get("gs_auth")?.value);
  return NextResponse.json({ ok: true, loggedIn: hasAuth });
}
