import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

/** GET /api/auth/session — sonda de sesión (post-login / hydrate). */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      username: auth.user.username,
      displayName: auth.user.displayName,
      companyName: auth.user.companyName,
    },
  });
}
