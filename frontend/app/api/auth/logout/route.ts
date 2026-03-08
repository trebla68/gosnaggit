import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // Clear Auth.js cookies used in production
  res.cookies.set("__Secure-authjs.session-token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  res.cookies.set("__Host-authjs.csrf-token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  res.cookies.set("__Secure-authjs.callback-url", "", {
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  // Clear non-secure dev cookie names too, just in case
  res.cookies.set("authjs.session-token", "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0),
  });

  res.cookies.set("authjs.csrf-token", "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0),
  });

  res.cookies.set("authjs.callback-url", "", {
    path: "/",
    expires: new Date(0),
  });

  return res;
}