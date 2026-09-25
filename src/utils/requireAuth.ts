import type { NextRequest } from "next/server";
import {
  decodeAuthCookieValue,
  extractBearerToken,
  mapPayloadToUser,
  normalizeAuthToken,
  verifyAuthToken,
} from "@/utils/auth";
import { AUTH_COOKIE_NAME, AUTH_TOKEN_HEADER } from "@/utils/constants";
import type { User } from "@/types";

export type AuthResult =
  | { ok: true; user: User; token: string }
  | { ok: false; response: Response };

function tokenFromRequest(request: NextRequest): string | null {
  const bearer = extractBearerToken(request.headers.get("authorization"));
  if (bearer) return bearer;

  // IIS/ARR suele strippear Authorization; el cliente también envía x-pulso-token.
  const custom = request.headers.get(AUTH_TOKEN_HEADER);
  if (custom?.trim()) {
    return normalizeAuthToken(custom);
  }

  // Algunos proxies reenvían el Bearer acá.
  const forwarded = extractBearerToken(
    request.headers.get("x-forwarded-authorization"),
  );
  if (forwarded) return forwarded;

  return decodeAuthCookieValue(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

/** Valida JWT desde cookie, Authorization Bearer o x-pulso-token. */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const token = tokenFromRequest(request);

  if (!token) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ message: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  try {
    const payload = await verifyAuthToken(token);
    const user = mapPayloadToUser(payload);
    return { ok: true, user, token };
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ message: "Token inválido o expirado" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
}
