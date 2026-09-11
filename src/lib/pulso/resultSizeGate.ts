import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import type { EjecutarSpResponse, SpArquitectura } from "@/lib/pulso/types";

/** Umbral de negocio: más de esto → preguntar al usuario (primeros N vs completo / filtros). */
export const RESULT_LARGE_THRESHOLD = 50;

/** Probe: pedimos threshold+1 para detectar overflow sin traer cientos de filas (si el API respeta limiteFilas). */
export const RESULT_LARGE_PROBE_LIMIT = RESULT_LARGE_THRESHOLD + 1;

export type ModoResultado = "preview50" | "completo";

export type ResultLargeGate = {
  ok: false;
  code: "RESULT_LARGE";
  nombreSp: string;
  totalRows: number;
  threshold: number;
  truncated: boolean;
  optionalParamsUnused: string[];
  optionalParamsHint: string[];
  choices: Array<"filtrar" | "primeros_50" | "completo">;
  avisoUsuario: string;
};

function isParamOptional(p: { requerido?: boolean; required?: boolean }): boolean {
  return (p.requerido ?? p.required) === false;
}

function humanizeParamName(nombre: string): string {
  const n = nombre.replace(/^@/, "");
  const map: Record<string, string> = {
    IDSucursal: "sucursal",
    IdSucursal: "sucursal",
    IDOrigenPedido: "origen del pedido",
    Top: "cantidad máxima de filas",
    ModoOrden: "orden",
    SearchTerm: "texto de búsqueda",
    LikeTerm: "texto de búsqueda",
    CodigoRubro: "código de rubro",
    IdRubro: "rubro",
    IDRubro: "rubro",
    CodigoMarca: "código de marca",
    IdMarca: "marca",
    IDMarca: "marca",
    FechaDesde: "fecha desde",
    FechaHasta: "fecha hasta",
    DesdeFecha: "fecha desde",
    HastaFecha: "fecha hasta",
  };
  if (map[n]) return map[n];
  return n
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^ID\s?/i, "")
    .toLowerCase();
}

/** Params opcionales del catálogo que el usuario/LLM no envió. */
export function listUnusedOptionalParams(
  nombreSp: string,
  sent: Record<string, unknown>,
  catalog: SpArquitectura[],
): string[] {
  const sp = catalog.find(
    (item) => getSpNombre(item).toLowerCase() === nombreSp.toLowerCase(),
  );
  if (!sp) return [];

  const sentKeys = new Set(
    Object.keys(sent)
      .filter((k) => {
        const v = sent[k];
        if (v == null) return false;
        if (typeof v === "string" && v.trim() === "") return false;
        return true;
      })
      .map((k) => k.toLowerCase()),
  );

  return getSpParametros(sp)
    .filter(isParamOptional)
    .filter((p) => !sentKeys.has(p.nombre.toLowerCase()))
    .map((p) => p.nombre);
}

export function resolveResultSize(
  result: EjecutarSpResponse,
): { totalRows: number; truncated: boolean; rows: unknown[] } {
  const rows = Array.isArray(result.rows)
    ? result.rows
    : Array.isArray(result.data)
      ? (result.data as unknown[])
      : [];
  const totalRows =
    typeof result.totalRows === "number" ? result.totalRows : rows.length;
  const truncated =
    Boolean(result.truncated) || totalRows > RESULT_LARGE_THRESHOLD;
  return { totalRows, truncated, rows };
}

/**
 * Si el resultado supera el umbral y no hay modo confirmado, arma el gate RESULT_LARGE.
 */
export function buildResultLargeGate(options: {
  nombreSp: string;
  totalRows: number;
  truncated: boolean;
  optionalParamsUnused: string[];
}): ResultLargeGate {
  const { nombreSp, totalRows, truncated, optionalParamsUnused } = options;
  const hints = optionalParamsUnused.map(humanizeParamName);
  const hasFilters = optionalParamsUnused.length > 0;

  const choices: ResultLargeGate["choices"] = hasFilters
    ? ["filtrar", "primeros_50", "completo"]
    : ["primeros_50", "completo"];

  const avisoUsuario = hasFilters
    ? [
        `La consulta devolvió muchos registros (${totalRows}).`,
        "NO muestres la tabla completa todavía.",
        `Ofrecé en lenguaje de negocio: (1) acotar con filtros disponibles (${hints.join(", ")}),`,
        `(2) ver solo los primeros ${RESULT_LARGE_THRESHOLD}, o (3) ver la respuesta completa (${totalRows} registros).`,
        "Si elige primeros 50 → reejecutá con modoResultado=preview50.",
        "Si elige completo → reejecutá con modoResultado=completo.",
        "Si aporta un filtro → reejecutá con ese parámetro (sin modoResultado).",
        "No menciones SP, SQL ni nombres técnicos crudos de parámetros.",
      ].join(" ")
    : [
        `La consulta devolvió muchos registros (${totalRows}).`,
        "NO muestres la tabla completa todavía.",
        `Preguntá si desea ver los primeros ${RESULT_LARGE_THRESHOLD} resultados o la respuesta completa (${totalRows} registros).`,
        "Si elige primeros 50 → modoResultado=preview50.",
        "Si elige completo → modoResultado=completo.",
        "No menciones SP, SQL ni nombres técnicos crudos.",
      ].join(" ");

  return {
    ok: false,
    code: "RESULT_LARGE",
    nombreSp,
    totalRows,
    threshold: RESULT_LARGE_THRESHOLD,
    truncated,
    optionalParamsUnused,
    optionalParamsHint: hints,
    choices,
    avisoUsuario,
  };
}

/** ¿Hay que preguntar al usuario antes de devolver filas al LLM? */
export function shouldGateLargeResult(
  modoResultado: ModoResultado | undefined,
  totalRows: number,
  truncated: boolean,
): boolean {
  if (modoResultado === "preview50" || modoResultado === "completo") {
    return false;
  }
  return truncated || totalRows > RESULT_LARGE_THRESHOLD;
}
