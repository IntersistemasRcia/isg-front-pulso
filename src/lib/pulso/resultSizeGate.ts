import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import type { EjecutarSpResponse, SpArquitectura } from "@/lib/pulso/types";

/** Umbral de negocio: más de esto → preview 50 + Excel total / filtros. */
export const RESULT_LARGE_THRESHOLD = 50;

/** Probe: pedimos threshold+1 para detectar overflow sin traer cientos de filas. */
export const RESULT_LARGE_PROBE_LIMIT = RESULT_LARGE_THRESHOLD + 1;

export type ModoResultado = "preview50" | "completo";

export type ResolvedResultSize = {
  totalRows: number;
  truncated: boolean;
  rows: unknown[];
  /**
   * false cuando el backend solo devolvió el tamaño del lote (p.ej. 51)
   * y no el COUNT real. Nunca presentar ese número como total exacto.
   */
  totalExact: boolean;
  /** Mínimo conocido cuando totalExact=false (p.ej. “más de 50”). */
  atLeastRows: number;
};

export type ResultLargeGate = {
  ok: false;
  code: "RESULT_LARGE";
  nombreSp: string;
  totalRows: number;
  totalExact: boolean;
  atLeastRows: number;
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
    Nombre: "nombre",
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

/**
 * Interpreta tamaño del resultado.
 * Si truncated y totalRows ≈ tamaño del lote/probe, el total NO es exacto
 * (el API a menudo reporta 51 = limiteFilas, no el COUNT real).
 */
export function resolveResultSize(
  result: EjecutarSpResponse,
  options?: { limiteFilas?: number | null },
): ResolvedResultSize {
  const rows = Array.isArray(result.rows)
    ? result.rows
    : Array.isArray(result.data)
      ? (result.data as unknown[])
      : [];
  const limiteFilas =
    options?.limiteFilas ??
    (typeof result.limiteFilas === "number" ? result.limiteFilas : null);
  const reportedTotal =
    typeof result.totalRows === "number" ? result.totalRows : rows.length;
  const truncatedFlag = Boolean(result.truncated);
  const hitLimit =
    limiteFilas != null &&
    limiteFilas > 0 &&
    (rows.length >= limiteFilas || reportedTotal >= limiteFilas);
  const truncated =
    truncatedFlag || hitLimit || reportedTotal > RESULT_LARGE_THRESHOLD;

  // Total exacto solo si no cortamos, o el backend dio un COUNT > tamaño del lote.
  const batchSize = Math.max(rows.length, limiteFilas ?? 0);
  const totalExact =
    !truncated ||
    (typeof result.totalRows === "number" &&
      result.totalRows > batchSize &&
      !(limiteFilas != null && result.totalRows <= limiteFilas));

  const totalRows = totalExact ? reportedTotal : reportedTotal;
  const atLeastRows = truncated
    ? Math.max(
        RESULT_LARGE_THRESHOLD + 1,
        rows.length,
        totalExact ? reportedTotal : Math.min(reportedTotal, batchSize),
      )
    : totalRows;

  return { totalRows, truncated, rows, totalExact, atLeastRows };
}

export function formatKnownTotalLabel(size: Pick<ResolvedResultSize, "totalExact" | "totalRows" | "atLeastRows">): string {
  if (size.totalExact) return String(size.totalRows);
  return `más de ${RESULT_LARGE_THRESHOLD}`;
}

/**
 * Si el resultado supera el umbral y no hay modo confirmado, arma el gate RESULT_LARGE.
 * No inventar totales (evitar “51” del probe).
 */
export function buildResultLargeGate(options: {
  nombreSp: string;
  totalRows: number;
  totalExact: boolean;
  atLeastRows: number;
  truncated: boolean;
  optionalParamsUnused: string[];
}): ResultLargeGate {
  const {
    nombreSp,
    totalRows,
    totalExact,
    atLeastRows,
    truncated,
    optionalParamsUnused,
  } = options;
  const hints = optionalParamsUnused.map(humanizeParamName);
  const hasFilters = optionalParamsUnused.length > 0;
  const totalLabel = totalExact
    ? String(totalRows)
    : `más de ${RESULT_LARGE_THRESHOLD}`;

  const choices: ResultLargeGate["choices"] = hasFilters
    ? ["filtrar", "primeros_50", "completo"]
    : ["primeros_50", "completo"];

  const avisoUsuario = hasFilters
    ? [
        `La consulta tiene ${totalLabel} registros` +
          (totalExact ? "" : " (el total exacto se confirma al pedir el listado completo).") +
          ".",
        "NO muestres tabla markdown. NO digas un total inventado (p.ej. 51 del probe).",
        `Ofrecé en lenguaje de negocio: (1) filtrar por ${hints.join(", ")} (nombre o parcial),`,
        `(2) ver solo los primeros ${RESULT_LARGE_THRESHOLD} en el chat, o (3) Excel con TODOS los registros.`,
        "Si elige primeros 50 → modoResultado=preview50.",
        "Si elige completo / todos / Excel → modoResultado=completo (Excel con el total real; la UI muestra adelanto de 50).",
        "Si aporta un filtro → reejecutá con ese parámetro (sin modoResultado).",
        "No menciones SP, SQL ni nombres técnicos crudos de parámetros.",
      ].join(" ")
    : [
        `La consulta tiene ${totalLabel} registros` +
          (totalExact ? "" : " (el total exacto se confirma al pedir el listado completo).") +
          ".",
        "NO muestres tabla markdown. NO digas un total inventado.",
        `Preguntá si desea ver los primeros ${RESULT_LARGE_THRESHOLD} en el chat o descargar Excel con el listado completo.`,
        "primeros 50 → modoResultado=preview50; completo/Excel → modoResultado=completo.",
        "No menciones SP, SQL ni nombres técnicos crudos.",
      ].join(" ");

  return {
    ok: false,
    code: "RESULT_LARGE",
    nombreSp,
    totalRows: totalExact ? totalRows : atLeastRows,
    totalExact,
    atLeastRows,
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
