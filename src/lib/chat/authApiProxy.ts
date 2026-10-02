/**
 * Proxy server-side hacia isg-api-auth (AUTH_API_URL).
 * Usado por las Route Handlers de conversaciones PulsoChat.
 */

export function getAuthApiBaseUrl(): string | null {
  const raw = process.env.AUTH_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function authApiNotConfiguredResponse(): Response {
  return Response.json(
    {
      message:
        "AUTH_API_URL no configurada. El historial de chat requiere la API Auth.",
    },
    { status: 503 },
  );
}

/** Reenvía al path relativo de Auth (p.ej. `/api/PulsoChat/Conversaciones`). */
export async function proxyToAuthApi(
  path: string,
  init: {
    token: string;
    method?: string;
    body?: string | null;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const base = getAuthApiBaseUrl();
  if (!base) {
    return authApiNotConfiguredResponse();
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${init.token}`,
    Accept: "application/json",
  };
  if (init.body != null) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body ?? undefined,
    signal: init.signal,
    cache: "no-store",
  });
}

/** Copia status + body del upstream Auth al Response de Next. */
export async function forwardAuthResponse(
  upstream: Response,
): Promise<Response> {
  if (upstream.status === 204) {
    return new Response(null, { status: 204 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const text = await upstream.text();

  if (!text) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType.includes("json")
        ? "application/json"
        : contentType || "application/json",
    },
  });
}
