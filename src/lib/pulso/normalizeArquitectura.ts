import type { SpArquitectura, SpParametroArquitectura } from "./types";
import { translatePulsoApiError } from "@/utils/userFacingErrors";

/**
 * Item crudo de GET /SPs_arquitectura (isg-api-pulso develop).
 * Default slim: { nombreSp, parametros[] } desde sys.parameters.
 * Legacy / ?includeSql=true: { NombreSP, CodigoSQL }.
 */
export interface PulsoSpArquitecturaRaw {
  nombreSp?: string;
  NombreSP?: string;
  nombreSP?: string;
  nombre?: string;
  name?: string;
  CodigoSQL?: string;
  codigoSQL?: string;
  codigoSql?: string;
  descripcion?: string;
  description?: string;
  parametros?: Array<SpParametroArquitectura | Record<string, unknown>>;
  parameters?: Array<SpParametroArquitectura | Record<string, unknown>>;
}

/**
 * Nombres que NUNCA son parámetros de entrada (variables de cuerpo / CATCH).
 * Defensa si llega includeSql o un modelo inventa estos nombres.
 */
const SP_PARAM_DENYLIST = new Set(
  [
    "LikeTerm",
    "ErrorMessage",
    "ErrorSeverity",
    "ErrorState",
    "ErrorNumber",
    "ErrorLine",
    "ErrorProcedure",
    "TRANCOUNT",
    "RowCount",
    "ReturnCode",
    "sql",
    "Msg",
  ].map((n) => n.toLowerCase()),
);

export function isDeniedSpParamName(name: string): boolean {
  return SP_PARAM_DENYLIST.has(name.replace(/^@/, "").toLowerCase());
}

const SQL_TYPES =
  "datetime|date|smalldatetime|datetime2|int|bigint|smallint|tinyint|bit|decimal|numeric|float|real|money|smallmoney|varchar|nvarchar|char|nchar|uniqueidentifier|xml|varbinary|text|ntext";

/** Fallback solo si el API devolvió CodigoSQL (?includeSql=true). */
export function extractProcedureSignature(codigoSql: string): string | null {
  const cleaned = codigoSql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");

  const createMatch =
    /(?:create|alter)\s+proc(?:edure)?\s+(?:\[?[A-Za-z0-9_]+\]?\s*\.\s*)?\[?[A-Za-z0-9_]+\]?/i.exec(
      cleaned,
    );
  if (!createMatch || createMatch.index == null) return null;

  const afterName = cleaned.slice(createMatch.index + createMatch[0].length);
  const asMatch = /\bas\b/i.exec(afterName);
  if (!asMatch || asMatch.index == null) return null;

  return afterName.slice(0, asMatch.index);
}

export function extractParamsFromSql(codigoSql: string): SpParametroArquitectura[] {
  const signature = extractProcedureSignature(codigoSql);
  if (!signature) return [];

  const seen = new Map<string, SpParametroArquitectura>();
  const typedPattern = new RegExp(
    `@([A-Za-z_][A-Za-z0-9_]*)\\s+(${SQL_TYPES})(?:\\s*\\([^)]*\\))?\\s*(?:=\\s*(?:N?'[^']*'|[^,\\s)]+))?\\s*(OUTPUT|OUT)?`,
    "gi",
  );

  for (const match of signature.matchAll(typedPattern)) {
    const name = match[1];
    if (isDeniedSpParamName(name)) continue;
    if (match[3]) continue;

    const hasDefault = /=\s*(?:N?'[^']*'|[^,\s)]+)/i.test(match[0]);
    seen.set(name.toLowerCase(), {
      nombre: name,
      tipo: match[2].toLowerCase(),
      requerido: !hasDefault,
      esOutput: false,
    });
  }

  return Array.from(seen.values());
}

function normalizeParamItem(
  raw: SpParametroArquitectura | Record<string, unknown>,
): SpParametroArquitectura | null {
  const obj = raw as Record<string, unknown>;
  const nombre = String(obj.nombre ?? obj.name ?? "")
    .trim()
    .replace(/^@/, "");
  if (!nombre || isDeniedSpParamName(nombre)) return null;

  const esOutput = Boolean(obj.esOutput ?? obj.EsOutput ?? obj.isOutput);
  if (esOutput) return null;

  const tipo = String(obj.tipo ?? obj.type ?? obj.TipoParametro ?? "").trim() || undefined;
  const requerido =
    obj.requerido ??
    obj.required ??
    (obj.TieneDefault != null ? !Boolean(obj.TieneDefault) : undefined);

  return {
    nombre,
    tipo: tipo?.toLowerCase(),
    requerido: requerido === undefined ? true : Boolean(requerido),
    esOutput: false,
  };
}

function humanizeSpDescription(
  nombre: string,
  params: SpParametroArquitectura[],
): string {
  const short = nombre.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ");
  const paramList = params.map((p) => p.nombre).join(", ");
  return paramList
    ? `${short}. Parámetros de entrada: ${paramList}.`
    : `${short}. Sin parámetros de entrada.`;
}

/** Normaliza un ítem de SPs_arquitectura (slim sys.parameters o legacy SQL). */
export function normalizeArquitecturaItem(raw: PulsoSpArquitecturaRaw): SpArquitectura {
  const nombre = String(
    raw.nombreSp ??
      raw.NombreSP ??
      raw.nombreSP ??
      raw.nombre ??
      raw.name ??
      "",
  ).trim();

  const codigoSql = String(
    raw.CodigoSQL ?? raw.codigoSQL ?? raw.codigoSql ?? "",
  ).trim();

  const fromApi = (raw.parametros ?? raw.parameters ?? [])
    .map(normalizeParamItem)
    .filter((p): p is SpParametroArquitectura => Boolean(p));

  const parametros =
    fromApi.length > 0
      ? fromApi
      : codigoSql
        ? extractParamsFromSql(codigoSql)
        : [];

  return {
    nombre,
    name: nombre,
    descripcion: humanizeSpDescription(nombre, parametros),
    codigoSql: codigoSql || undefined,
    parametros,
    parameters: parametros,
  };
}

/** Normaliza el payload completo de GET /SPs_arquitectura. */
export function normalizeArquitecturaPayload(raw: unknown): SpArquitectura[] {
  let list: PulsoSpArquitecturaRaw[] = [];

  if (Array.isArray(raw)) {
    list = raw as PulsoSpArquitecturaRaw[];
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "sps", "items", "result", "arquitectura"] as const) {
      if (Array.isArray(obj[key])) {
        list = obj[key] as PulsoSpArquitecturaRaw[];
        break;
      }
    }
  }

  return list
    .map(normalizeArquitecturaItem)
    .filter((sp) => sp.nombre.length > 0);
}

/** Body POST /ejecutar-sp — PeticionSpDto (camelCase). */
export function toPulsoEjecutarSpBody(request: {
  nombreSp: string;
  parametros?: Record<string, unknown>;
}): { nombreSp: string; parametros: Record<string, unknown> } {
  return {
    nombreSp: request.nombreSp,
    parametros: request.parametros ?? {},
  };
}

export function parsePulsoApiError(status: number, data: unknown): string {
  return translatePulsoApiError(status, data).message;
}
