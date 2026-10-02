import type { ExcelSpec } from "@/lib/chat/tabularSpec";
import { excelColumns } from "@/lib/chat/tabularSpec";

type StoredExport = {
  spec: ExcelSpec;
  createdAt: number;
  userId?: string;
};

const TTL_MS = 15 * 60 * 1000;
const store = new Map<string, StoredExport>();

function gc(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Normaliza filas dinámicas del ERP a ExcelSpec (sin tope de 200 del fence LLM). */
export function buildExcelSpecFromRows(
  rows: unknown[],
  title: string,
): ExcelSpec | null {
  if (!rows.length) return null;
  const data: ExcelSpec["data"] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const normalized: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) normalized[k] = null;
      else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        normalized[k] = v;
      } else {
        normalized[k] = String(v);
      }
    }
    data.push(normalized);
  }
  if (!data.length) return null;
  const columns = excelColumns({ data });
  return {
    title: title.slice(0, 120),
    sheetName: "Datos",
    columns,
    data,
  };
}

export function storePulsoExcelExport(
  spec: ExcelSpec,
  userId?: string,
): string {
  gc();
  const id = newId();
  store.set(id, { spec, createdAt: Date.now(), userId });
  return id;
}

export function getPulsoExcelExport(id: string): ExcelSpec | null {
  gc();
  const entry = store.get(id);
  if (!entry) return null;
  return entry.spec;
}
