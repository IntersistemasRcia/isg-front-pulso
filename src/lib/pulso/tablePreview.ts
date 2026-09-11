/** Helpers para preview de resultados tabulares (tool → MessageBubble). */

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

/** Instrucción interna para el modelo (no repetir jerga al usuario). */
export const UI_TABLE_AVISO =
  "En pantalla ya hay una tabla con el adelanto. " +
  "NO armes listas ni tablas en el texto. " +
  "Respondé 1–3 frases en lenguaje de negocio (sin decir UI, HTML, tool ni API).";
