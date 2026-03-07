import { NextResponse } from "next/server";
import { auth } from "../../../../auth";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: (session.user as any).id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
    },
  });
}