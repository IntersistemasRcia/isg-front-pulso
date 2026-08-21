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

/** Valida firma HS256 del JWT emitido por API_Auth. */
export async function verifyAuthToken(
  token: string,
  secret = process.env.JWT_SECRET ?? "",
): Promise<JwtPayload> {
  if (!secret) {
    throw new Error("JWT_SECRET no configurado");
  }

  const { payload } = await jwtVerify(token, encoder.encode(secret));
  return payload as JwtPayload;
}

/** Mapea claims del JWT a el modelo User de la app. */
export function mapPayloadToUser(payload: JwtPayload, fallbackUsername?: string): User {
  const clienteId =
    String(payload.clienteId ?? payload.ClienteId ?? payload.cid ?? "");
  const companyName = String(
    payload.companyName ?? payload.CompanyName ?? payload.empresa ?? "Cliente",
  );
  const username = String(
    payload.unique_name ?? payload.name ?? fallbackUsername ?? payload.sub ?? "usuario",
  );

  return {
    id: String(payload.sub ?? username),
    username,
    displayName: String(payload.name ?? username),
    email: payload.email ? String(payload.email) : undefined,
    clienteId,
    companyName,
  };
}

/** Extrae Bearer token del header Authorization. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
