import {
  assertPulsoConfigured,
  getPulsoApiBaseUrl,
  resolvePulsoToken,
} from "@/lib/pulso/config";
import {
  normalizeArquitecturaPayload,
  parsePulsoApiError,
  toPulsoEjecutarSpBody,
} from "@/lib/pulso/normalizeArquitectura";
import type {
  EjecutarSpRequest,
  EjecutarSpResponse,
  SpArquitectura,
} from "@/lib/pulso/types";
import {
  translatePulsoApiError,
  type UserErrorCode,
} from "@/utils/userFacingErrors";

type FetchOptions = {
  /** JWT de sesión del usuario autenticado en Pulso front. */
  sessionToken?: string | null;
  signal?: AbortSignal;
};

/** Error HTTP de isg-api-pulso con mensaje ya traducido. */
export class PulsoApiError extends Error {
  readonly httpStatus: number;
  readonly code: UserErrorCode;
  readonly title: string;

  constructor(httpStatus: number, data: unknown) {
    const translated = translatePulsoApiError(httpStatus, data);
    super(translated.message);
    this.name = "PulsoApiError";
    this.httpStatus = httpStatus;
    this.code = translated.code;
    this.title = translated.title;
  }
}

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
 * GET /SPs_arquitectura — catálogo slim (sys.parameters).
 * Por defecto sin CodigoSQL (ahorro de tokens). Usá includeSql solo para debug.
 */
export async function fetchSpsArquitectura(
  options: FetchOptions & { includeSql?: boolean } = {},
): Promise<SpArquitectura[]> {
  const query = options.includeSql ? "?includeSql=true" : "";
  const response = await pulsoFetch(`/SPs_arquitectura${query}`, {
    method: "GET",
    sessionToken: options.sessionToken,
    signal: options.signal,
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    throw new PulsoApiError(response.status, raw);
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
  const payload = toPulsoEjecutarSpBody({
    nombreSp: body.nombreSp,
    parametros: body.parametros,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[pulso] POST /ejecutar-sp", JSON.stringify(payload));
  }

  const response = await pulsoFetch("/ejecutar-sp", {
    method: "POST",
    sessionToken: options.sessionToken,
    signal: options.signal,
    body: JSON.stringify(payload),
  });

  const raw: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: parsePulsoApiError(response.status, raw),
      request: body,
      data: raw,
    };
  }

  // La API devuelve IEnumerable<dynamic> → array JSON de filas
  if (Array.isArray(raw)) {
    return {
      ok: true,
      rows: raw,
      data: raw,
    };
  }

  return {
    ok: true,
    ...(typeof raw === "object" && raw !== null ? (raw as EjecutarSpResponse) : {}),
  };
}
