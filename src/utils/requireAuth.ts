import type { NextRequest } from "next/server";
import {
  extractBearerToken,
  mapPayloadToUser,
  verifyAuthToken,
} from "@/utils/auth";
import { AUTH_COOKIE_NAME } from "@/utils/constants";
import type { User } from "@/types";

export type AuthResult =
  | { ok: true; user: User; token: string }
  | { ok: false; response: Response };

/** Valida JWT desde cookie o Authorization Bearer. */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const token = extractBearerToken(authHeader) ?? cookieToken ?? null;

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