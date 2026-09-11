/** Helpers para preview UI de resultados tabulares (tool → MessageBubble). */

export const WIDE_COLUMN_THRESHOLD = 6;
/** Adelanto en el chat: siempre resumen; el Excel lleva el total. */
export const UI_PREVIEW_MAX_ROWS = 50;

export function countRowColumns(rows: unknown[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row as object)) keys.add(key);
  }
  return keys.size;
}

export function asObjectRows(rows: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    out.push(row as Record<string, unknown>);
  }
  return out;
}

export function slicePreviewRows(
  rows: unknown[],
  maxRows = UI_PREVIEW_MAX_ROWS,
): Array<Record<string, unknown>> {
  return asObjectRows(rows).slice(0, maxRows);
}

export const UI_TABLE_AVISO =
  "La UI del chat ya muestra una tabla HTML con el preview. " +
  "NO armes ninguna tabla markdown (rompe el formato con muchas columnas). " +
  "Respondé solo con 1–3 frases de contexto y, si aplica, ofrecé Excel/completo o filtros.";
