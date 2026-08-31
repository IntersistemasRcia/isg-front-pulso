import { NextRequest, NextResponse } from "next/server";
import { SignJWT, decodeJwt } from "jose";
import { isTokenExpired, mapPayloadToUser } from "@/utils/auth";
import { AUTH_COOKIE_NAME } from "@/utils/constants";
import type { LoginCredentials, LoginResponse } from "@/types";

/** Credenciales locales solo si AUTH_API_URL está vacía. */
const LOCAL_USER = process.env.LOCAL_AUTH_USER || "demo";
const LOCAL_PASS = process.env.LOCAL_AUTH_PASSWORD || "demo";
const LOCAL_JWT_SECRET =
  process.env.JWT_SECRET || "pulso-local-dev-secret";

/** Path del login en API Auth (.NET). */
const AUTH_LOGIN_PATH = "/api/Auth/Login";

async function issueLocalToken(username: string): Promise<{
  token: string;
  expiresAt: string;
  user: LoginResponse["user"];
}> {
  const expiresInSeconds = 60 * 60 * 8;
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const token = await new SignJWT({
    sub: "local-demo",
    name: "Usuario Demo",
    username,
    userId: "local-demo",
    clienteId: "LOCAL-001",
    companyName: "ISG Demo",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(LOCAL_JWT_SECRET));

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    user: {
      id: "local-demo",
      username,
      displayName: "Usuario Demo",
      clienteId: "LOCAL-001",
      companyName: "ISG Demo",
    },
  };
}

function buildAuthResponse(
  token: string,
  user: LoginResponse["user"],
  expiresAt?: string,
) {
  const response: LoginResponse = { token, expiresAt, user };
  const res = NextResponse.json(response);
  const maxAge = expiresAt
    ? Math.max(Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000), 0)
    : 60 * 60 * 8;

  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return res;
}

/**
 * Proxy de login hacia API Auth.
 * Body hacia Auth: { usuario, password }
 * Response Auth: { token, validTo }
 * Si AUTH_API_URL está vacía → login local demo/demo.
 */
export async function POST(request: NextRequest) {
  let body: LoginCredentials;

  try {
    body = (await request.json()) as LoginCredentials;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { message: "Usuario y contraseña son obligatorios" },
      { status: 400 },
    );
  }

  const authApiUrl = process.env.AUTH_API_URL?.trim();

  if (!authApiUrl) {
    if (body.username !== LOCAL_USER || body.password !== LOCAL_PASS) {
      return NextResponse.json(
        {
          message: `Credenciales inválidas. Modo local: usuario "${LOCAL_USER}" / contraseña "${LOCAL_PASS}".`,
        },
        { status: 401 },
      );
    }

    const local = await issueLocalToken(body.username);
    return buildAuthResponse(local.token, local.user, local.expiresAt);
  }

  try {
    const loginUrl = `${authApiUrl.replace(/\/$/, "")}${AUTH_LOGIN_PATH}`;
    const upstream = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        usuario: body.username,
        password: body.password,
      }),
      cache: "no-store",
    });

    const raw = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

    if (!upstream.ok) {
      const message =
        (raw.Mensaje as string) ||
        (raw.message as string) ||
        (raw.Message as string) ||
        (raw.title as string) ||
        "Credenciales inválidas";
      return NextResponse.json({ message }, { status: upstream.status });
    }

    const token = String(raw.token ?? raw.Token ?? "");

    if (!token) {
      return NextResponse.json(
        { message: "La API Auth no devolvió un JWT" },
        { status: 502 },
      );
    }

    if (isTokenExpired(token)) {
      return NextResponse.json(
        { message: "El token recibido está expirado" },
        { status: 502 },
      );
    }

    const payload = decodeJwt(token);
    const user = mapPayloadToUser(
      payload as Parameters<typeof mapPayloadToUser>[0],
      body.username,
    );

    const validTo = raw.validTo ?? raw.ValidTo;
    const expiresAt =
      typeof validTo === "string"
        ? validTo
        : payload.exp
          ? new Date(payload.exp * 1000).toISOString()
          : undefined;

    return buildAuthResponse(token, user, expiresAt);
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json(
      { message: "No se pudo contactar la API Auth" },
      { status: 502 },
    );
  }
}
