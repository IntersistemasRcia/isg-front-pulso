import { NextRequest, NextResponse } from "next/server";
import { getAvailableProviders } from "@/lib/llm";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

/** GET /api/chat/providers — modelos free/premium disponibles para el usuario. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const models = await getAvailableProviders(auth.user.id);
  return NextResponse.json({ models });
}