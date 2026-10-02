import type { NextRequest } from "next/server";
import {
  authApiNotConfiguredResponse,
  forwardAuthResponse,
  getAuthApiBaseUrl,
  proxyToAuthApi,
} from "@/lib/chat/authApiProxy";
import { requireAuth } from "@/utils/requireAuth";

type RouteContext = { params: Promise<{ id: string }> };

/** POST append mensajes → Auth PulsoChat. */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  if (!getAuthApiBaseUrl()) return authApiNotConfiguredResponse();

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ message: "id inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("mensajes" in body) ||
    !Array.isArray((body as { mensajes: unknown }).mensajes)
  ) {
    return Response.json(
      { message: "mensajes[] es obligatorio" },
      { status: 400 },
    );
  }

  const upstream = await proxyToAuthApi(
    `/api/PulsoChat/Conversaciones/${encodeURIComponent(id)}/Mensajes`,
    {
      token: auth.token,
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return forwardAuthResponse(upstream);
}
