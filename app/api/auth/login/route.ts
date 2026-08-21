import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { isTokenExpired, mapPayloadToUser } from "@/utils/auth";
import { AUTH_COOKIE_NAME } from "@/utils/constants";
import type { LoginCredentials, LoginResponse } from "@/types";

/**
 * Proxy de login hacia la API Auth existente del cliente (on-premise).
 * POST /api/auth/login
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

  const authApiUrl = process.env.AUTH_API_URL;

  // Modo desarrollo sin API Auth: emite un JWT de prueba firmado localmente
  if (!authApiUrl) {
    return NextResponse.json(
      {
        message:
          "AUTH_API_URL no configurada. Defina la URL de API_Auth en las variables de entorno.",
      },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${authApiUrl.replace(/\/$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: body.username,
        password: body.password,
        // Variantes comunes de APIs .NET
        Usuario: body.username,
        Password: body.password,
      }),
      cache: "no-store",
    });

    const raw = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

    if (!upstream.ok) {
      const message =
        (raw.message as string) ||
        (raw.Message as string) ||
        "Credenciales inválidas";
      return NextResponse.json({ message }, { status: upstream.status });
    }

    const token = String(
      raw.token ?? raw.Token ?? raw.access_token ?? raw.accessToken ?? "",
    );

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
    const user = mapPayloadToUser(payload as Parameters<typeof mapPayloadToUser>[0], body.username);

    const response: LoginResponse = {
      token,
      expiresAt: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : undefined,
      user,
    };

    const res = NextResponse.json(response);
    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: payload.exp
        ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 0)
        : 60 * 60 * 8,
    });

    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json(
      { message: "No se pudo contactar la API Auth" },
      { status: 502 },
    );
  }
}
