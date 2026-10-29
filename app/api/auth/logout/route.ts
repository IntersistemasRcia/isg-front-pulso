import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/utils/constants";

/** POST /api/auth/logout — borra la cookie HttpOnly de sesión. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
