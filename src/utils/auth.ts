import { jwtVerify, decodeJwt } from "jose";
import type { JwtPayload, User } from "@/types";

const encoder = new TextEncoder();

/** Indica si el JWT ya expiró (usa claim `exp`). */
export function isTokenExpired(token: string, skewSeconds = 30): boolean {
  try {
    const payload = decodeJwt(token);
    if (!payload.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now + skewSeconds;
  } catch {
    return true;
  }
}

/**
 * Valida el JWT de API Auth.
 * - Con JWT_SECRET: verifica firma (HS256 / HS512).
 * - Sin JWT_SECRET: solo decodifica y chequea expiración (útil en test).
 */
export async function verifyAuthToken(
  token: string,
  secret = process.env.JWT_SECRET,
): Promise<JwtPayload> {
  if (secret) {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return payload as JwtPayload;
  }

  // Fallback local de firma propia (modo demo sin AUTH_API_URL)
  if (!process.env.AUTH_API_URL?.trim()) {
    const { payload } = await jwtVerify(
      token,
      encoder.encode("pulso-local-dev-secret"),
    );
    return payload as JwtPayload;
  }

  // API Auth remota sin secreto configurado: confiar en estructura + exp
  const payload = decodeJwt(token) as JwtPayload;
  if (isTokenExpired(token)) {
    throw new Error("Token expirado");
  }
  return payload;
}

/** Mapea claims del JWT de API Auth al modelo User de la app. */
export function mapPayloadToUser(payload: JwtPayload, fallbackUsername?: string): User {
  const clienteId = String(
    payload.clienteId ?? payload.ClienteId ?? payload.cid ?? payload.apiMode ?? "",
  );
  const companyName = String(
    payload.companyName ??
      payload.CompanyName ??
      payload.empresa ??
      "isGestion",
  );
  const username = String(
    payload.username ??
      payload.unique_name ??
      fallbackUsername ??
      payload.sub ??
      "usuario",
  );
  const id = String(payload.userId ?? payload.sub ?? username);

  return {
    id,
    username,
    displayName: String(payload.name ?? username),
    email: payload.email ? String(payload.email) : undefined,
    clienteId,
    companyName,
    roles: payload.role
      ? [String(payload.role)]
      : undefined,
  };
}

/** Extrae Bearer token del header Authorization. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
