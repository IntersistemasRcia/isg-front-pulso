import type { NextRequest } from "next/server";
import {
  authApiNotConfiguredResponse,
  forwardAuthResponse,
  getAuthApiBaseUrl,
  proxyToAuthApi,
} from "@/lib/chat/authApiProxy";
import { requireAuth } from "@/utils/requireAuth";

const AUTH_PATH = "/api/PulsoChat/Conversaciones";

/** GET lista / POST crea conversación → Auth PulsoChat. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  if (!getAuthApiBaseUrl()) return authApiNotConfiguredResponse();

  const upstream = await proxyToAuthApi(AUTH_PATH, { token: auth.token });
  return forwardAuthResponse(upstream);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  if (!getAuthApiBaseUrl()) return authApiNotConfiguredResponse();

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

  const upstream = await proxyToAuthApi(AUTH_PATH, {
    token: auth.token,
    method: "POST",
    body: JSON.stringify({ titulo }),
  });
  return forwardAuthResponse(upstream);
}
