import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import type { EjecutarSpResponse, SpArquitectura } from "@/lib/pulso/types";

/** Umbral de negocio: más de esto → adelanto + opción Excel completo. */
export const RESULT_LARGE_THRESHOLD = 50;

/**
 * Probe inicial: pedimos exactamente el umbral.
 * Con backend que envía totalRowsExact + COUNT real, alcanza para saber el total
 * sin traer N+1 ni reconsultar todo el listado.
 */
export const RESULT_LARGE_PROBE_LIMIT = RESULT_LARGE_THRESHOLD;

export type ModoResultado = "preview50" | "completo";

export type ResolvedResultSize = {
  totalRows: number;
  truncated: boolean;
  rows: unknown[];
  /**
   * true solo si el total es confiable (COUNT real o resultado completo sin corte).
   * false cuando totalRows es solo el tamaño del lote (legacy / probe sin COUNT).
   */
  totalExact: boolean;
  /** Mínimo conocido cuando totalExact=false. */
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

/** Hints de negocio para params opcionales no usados (reutilizado en payloads UI). */
export function listOptionalParamHints(
  nombreSp: string,
  sent: Record<string, unknown>,
  catalog: SpArquitectura[],
): string[] {
  return listUnusedOptionalParams(nombreSp, sent, catalog).map(humanizeParamName);
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
 * Interpreta tamaño del resultado según el contrato del API.
 *
 * totalExact:
 * - `totalRowsExact === true|false` del backend (preferido)
 * - si no viene: exacto si no truncó, o si totalRows > tamaño del lote/límite
 * - NUNCA exacto si truncated y totalRows ≤ limiteFilas (artifact tipo “51”)
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

  const batchSize = Math.max(rows.length, limiteFilas ?? 0);
  let totalExact: boolean;
  if (typeof result.totalRowsExact === "boolean") {
    totalExact = result.totalRowsExact;
  } else if (!truncated) {
    totalExact = true;
  } else if (
    typeof result.totalRows === "number" &&
    result.totalRows > batchSize
  ) {
    // COUNT real típico: truncated + totalRows > filas devueltas / límite.
    totalExact = true;
  } else {
    totalExact = false;
  }

  // Defensa: nunca marcar exacto un total que es solo el tope del lote.
  if (
    truncated &&
    limiteFilas != null &&
    reportedTotal <= limiteFilas &&
    result.totalRowsExact !== true
  ) {
    totalExact = false;
  }

  const totalRows = reportedTotal;
  const atLeastRows = truncated
    ? Math.max(
        RESULT_LARGE_THRESHOLD + 1,
        rows.length,
        totalExact ? reportedTotal : Math.min(reportedTotal, batchSize || reportedTotal),
      )
    : totalRows;

  return { totalRows, truncated, rows, totalExact, atLeastRows };
}

export function formatKnownTotalLabel(
  size: Pick<ResolvedResultSize, "totalExact" | "totalRows" | "atLeastRows">,
): string {
  if (size.totalExact) return String(size.totalRows);
  return `más de ${RESULT_LARGE_THRESHOLD}`;
}

/**
 * Gate sin filas (poco usado): cuando no queremos adelanto todavía.
 * Preferimos buildLargePreviewPayload en tools.
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
        `Hay ${totalLabel} registros` +
          (totalExact ? "" : " (sin COUNT exacto; no digas 51).") +
          ".",
        "NO listes filas ni armes tablas en el texto.",
        `Ofrecé: (1) filtrar por ${hints.join(", ")} (nombre o parcial),`,
        `(2) ver un adelanto de ${RESULT_LARGE_THRESHOLD} en pantalla, o (3) Excel con TODAS.`,
        "adelanto → modoResultado=preview50; completo/Excel → modoResultado=completo.",
        "Si aporta un filtro → reejecutá con ese parámetro (sin modoResultado).",
        "Nunca digas UI, HTML, tool, API ni SP.",
      ].join(" ")
    : [
        `Hay ${totalLabel} registros` +
          (totalExact ? "" : " (sin COUNT exacto; no digas 51).") +
          ".",
        "NO listes filas. Preguntá si quiere un adelanto de 50 o el Excel con todas.",
        "adelanto → modoResultado=preview50; completo/Excel → modoResultado=completo.",
        "Nunca digas UI, HTML, tool, API ni SP.",
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
