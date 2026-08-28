import {
  assertPulsoConfigured,
  getPulsoApiBaseUrl,
  resolvePulsoToken,
} from "@/lib/pulso/config";
import { normalizePulsoParametros } from "@/lib/pulso/formatParams";
import type {
  EjecutarSpRequest,
  EjecutarSpResponse,
  SpArquitectura,
} from "@/lib/pulso/types";

type FetchOptions = {
  /** JWT de sesión del usuario autenticado en Pulso front. */
  sessionToken?: string | null;
  signal?: AbortSignal;
};

async function getLocalHttpsDispatcher(): Promise<object | undefined> {
  // Certificado autofirmado de Kestrel/IIS Express en desarrollo local
  if (process.env.NODE_ENV === "production") return undefined;
  if (process.env.PULSO_TLS_INSECURE !== "1") return undefined;

  try {
    const { Agent } = await import("undici");
    return new Agent({
      connect: { rejectUnauthorized: false },
    });
  } catch {
    return undefined;
  }
}

async function pulsoFetch(
  path: string,
  init: RequestInit & { sessionToken?: string | null } = {},
): Promise<Response> {
  const baseUrl = getPulsoApiBaseUrl();
  const token = resolvePulsoToken(init.sessionToken);
  assertPulsoConfigured(baseUrl, token);

  const { sessionToken: _ignored, ...requestInit } = init;
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const dispatcher = await getLocalHttpsDispatcher();

  return fetch(url, {
    ...requestInit,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(requestInit.headers ?? {}),
    },
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit);
}

/**
 * GET /SPs_arquitectura — catálogo dinámico de procedimientos.
 */
export async function fetchSpsArquitectura(
  options: FetchOptions = {},
): Promise<SpArquitectura[]> {
  const response = await pulsoFetch("/SPs_arquitectura", {
    method: "GET",
    sessionToken: options.sessionToken,
    signal: options.signal,
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Error al obtener SPs_arquitectura (${response.status}): ${JSON.stringify(raw)}`,
    );
  }

  return normalizeArquitecturaPayload(raw);
}

/**
 * POST /ejecutar-sp — ejecuta un SP de la suite Vision.
 */
export async function ejecutarSpPulso(
  body: EjecutarSpRequest,
  options: FetchOptions = {},
): Promise<EjecutarSpResponse> {
  const payload: EjecutarSpRequest = {
    nombreSp: body.nombreSp,
    parametros: normalizePulsoParametros(body.parametros),
  };

  const response = await pulsoFetch("/ejecutar-sp", {
    method: "POST",
    sessionToken: options.sessionToken,
    signal: options.signal,
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as EjecutarSpResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: "Error al ejecutar SP en isg-api-pulso",
      request: payload,
      data,
    };
  }

  return data;
}

function normalizeArquitecturaPayload(raw: unknown): SpArquitectura[] {
  if (Array.isArray(raw)) {
    return raw as SpArquitectura[];
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "sps", "items", "result", "arquitectura"] as const) {
      if (Array.isArray(obj[key])) {
        return obj[key] as SpArquitectura[];
      }
    }
  }

  return [];
}
