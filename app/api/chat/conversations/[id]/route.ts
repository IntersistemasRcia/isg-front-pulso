import type { NextRequest } from "next/server";
import {
  authApiNotConfiguredResponse,
  forwardAuthResponse,
  getAuthApiBaseUrl,
  proxyToAuthApi,
} from "@/lib/chat/authApiProxy";
import { requireAuth } from "@/utils/requireAuth";

type RouteContext = { params: Promise<{ id: string }> };

function authPath(id: string): string {
  return `/api/PulsoChat/Conversaciones/${encodeURIComponent(id)}`;
}

/** GET detalle / PATCH título / DELETE soft → Auth. */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  if (!getAuthApiBaseUrl()) return authApiNotConfiguredResponse();

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ message: "id inválido" }, { status: 400 });
  }

  const upstream = await proxyToAuthApi(authPath(id), { token: auth.token });
  return forwardAuthResponse(upstream);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const titulo =
    body &&
    typeof body === "object" &&
    "titulo" in body &&
    typeof (body as { titulo: unknown }).titulo === "string"
      ? (body as { titulo: string }).titulo.trim()
      : "";

  if (!titulo) {
    return Response.json({ message: "titulo es obligatorio" }, { status: 400 });
  }

  const upstream = await proxyToAuthApi(authPath(id), {
    token: auth.token,
    method: "PATCH",
    body: JSON.stringify({ titulo }),
  });
  return forwardAuthResponse(upstream);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  if (!getAuthApiBaseUrl()) return authApiNotConfiguredResponse();

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json({ message: "id inválido" }, { status: 400 });
  }

  const upstream = await proxyToAuthApi(authPath(id), {
    token: auth.token,
    method: "DELETE",
  });
  return forwardAuthResponse(upstream);
}
