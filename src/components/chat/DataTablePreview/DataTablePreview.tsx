"use client";

import { formatMetricCell } from "@/lib/chat/tabularSpec";
import styles from "./DataTablePreview.module.css";

export type DataTablePreviewProps = {
  rows: Array<Record<string, unknown>>;
  /** Total real (si el preview está cortado). */
  totalRows?: number;
  caption?: string;
};

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys];
}

function formatCell(value: unknown, column: string): string {
  if (value == null) return "";
  const formatted = formatMetricCell(value, column);
  if (formatted != null) return formatted;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

/**
 * Tabla HTML confiable desde filas de la tool (no depende del markdown del LLM).
 */
export function DataTablePreview({
  rows,
  totalRows,
  caption,
}: DataTablePreviewProps) {
  if (!rows.length) return null;
  const columns = collectColumns(rows);
  if (!columns.length) return null;

  const shown = rows.length;
  const total = totalRows ?? shown;
  const truncated = total > shown;

  return (
    <div className={styles.wrap}>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td key={col}>{formatCell(row[col], col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.meta}>
        {truncated
          ? `Mostrando ${shown} de ${total} registros`
          : `${shown} registro${shown === 1 ? "" : "s"}`}
        {columns.length > 6 ? " · desplazá horizontalmente para ver más columnas" : ""}
      </p>
    </div>
  );
}
