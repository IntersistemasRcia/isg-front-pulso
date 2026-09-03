import { z } from "zod";

export const MAX_CHART_ROWS = 20;
export const MAX_EXCEL_ROWS = 200;
export const MAX_PIE_SLICES = 8;

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rowSchema = z.record(z.string(), cellSchema);

export const chartSpecSchema = z.object({
  type: z.enum(["bar", "line", "pie"]),
  title: z.string().max(120).optional(),
  labelKey: z.string().min(1),
  valueKey: z.string().min(1),
  data: z.array(rowSchema).min(1).max(MAX_CHART_ROWS),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export const excelSpecSchema = z.object({
  title: z.string().max(120).optional(),
  sheetName: z.string().max(31).optional(),
  columns: z.array(z.string().min(1)).max(30).optional(),
  data: z.array(rowSchema).min(1).max(MAX_EXCEL_ROWS),
});

export type ExcelSpec = z.infer<typeof excelSpecSchema>;

/** Interpreta números JSON o strings AR/US (1.234,56 / 1,234.56). */
export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(",") && trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function parseWithSchema<T>(raw: string, schema: z.ZodType<T>): T | null {
  const json = parseJsonObject(raw);
  if (json == null) return null;
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function parseChartSpec(raw: string): ChartSpec | null {
  const spec = parseWithSchema(raw, chartSpecSchema);
  if (!spec) return null;

  const numericRows = spec.data
    .map((row) => {
      const n = coerceNumber(row[spec.valueKey]);
      if (n == null) return null;
      return { ...row, [spec.valueKey]: n };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (numericRows.length === 0) return null;
  return { ...spec, data: numericRows };
}

export function parseExcelSpec(raw: string): ExcelSpec | null {
  return parseWithSchema(raw, excelSpecSchema);
}

export function excelColumns(spec: ExcelSpec): string[] {
  if (spec.columns && spec.columns.length > 0) return spec.columns;
  const keys = new Set<string>();
  for (const row of spec.data) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys];
}

export function coalescePieSlices(spec: ChartSpec): ChartSpec {
  if (spec.type !== "pie" || spec.data.length <= MAX_PIE_SLICES) return spec;

  const sorted = [...spec.data].sort(
    (a, b) => Number(b[spec.valueKey]) - Number(a[spec.valueKey]),
  );
  const head = sorted.slice(0, MAX_PIE_SLICES - 1);
  const rest = sorted.slice(MAX_PIE_SLICES - 1);
  const others = rest.reduce((sum, row) => sum + Number(row[spec.valueKey] ?? 0), 0);

  return {
    ...spec,
    data: [...head, { [spec.labelKey]: "Otros", [spec.valueKey]: others }],
  };
}

const arNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function formatArNumber(value: unknown): string {
  const n = typeof value === "number" ? value : coerceNumber(value);
  if (n == null) return String(value ?? "");
  return arNumber.format(n);
}
