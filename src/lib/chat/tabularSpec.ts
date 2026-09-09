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

/** Interpreta números JSON o strings AR/US (1.234,56 / 1,234.56 / 3370350.36). */
export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  // Prefijo/sufijo moneda o %
  trimmed = trimmed.replace(/^\$/, "").replace(/%$/, "");
  if (!trimmed || /[a-zA-Z]/.test(trimmed)) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador más a la derecha es el decimal
    if (lastComma > lastDot) {
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = trimmed.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // Solo comas: decimal AR si hay una coma con 1–2 dígitos; si no, miles US
    const after = trimmed.slice(lastComma + 1);
    normalized =
      /^\d{1,2}$/.test(after) && (trimmed.match(/,/g) ?? []).length === 1
        ? trimmed.replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const after = trimmed.slice(lastDot + 1);
    const dots = (trimmed.match(/\./g) ?? []).length;
    // Varios puntos → miles AR; un punto con 1–2 decimales → decimal US; un punto con 3 dígitos → miles
    if (dots > 1) {
      normalized = trimmed.replace(/\./g, "");
    } else if (/^\d{1,2}$/.test(after)) {
      normalized = trimmed;
    } else if (/^\d{3}$/.test(after)) {
      normalized = trimmed.replace(/\./g, "");
    } else {
      normalized = trimmed;
    }
  } else {
    normalized = trimmed;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const arNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function formatArNumber(value: unknown): string {
  const n = typeof value === "number" ? value : coerceNumber(value);
  if (n == null) return String(value ?? "");
  return arNumber.format(n);
}

const METRIC_HEADER_RE =
  /ventas?|margen|neta?s?|total(es)?|importe|monto|precio|costo|saldo|bruto|%|porcentaje|promedio|ticket/i;

const DATE_CELL_RE = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;

/**
 * Formatea una celda de tabla Markdown a es-AR solo si parece importe/métrica.
 * Evita IDs, códigos y conteos enteros chicos sin header de dinero.
 */
export function formatMetricCell(
  raw: unknown,
  columnHeader?: string,
): string | null {
  if (raw == null) return null;
  const original = String(raw).trim();
  if (!original || DATE_CELL_RE.test(original)) return null;

  const hasPercent = /%\s*$/.test(original);
  const n = coerceNumber(original);
  if (n == null) return null;

  const stripped = original.replace(/^\$/, "").replace(/%$/, "").trim();
  const hasDecimalSep =
    /,\d{1,2}$/.test(stripped.replace(/\s/g, "")) ||
    (/\.\d{1,2}$/.test(stripped.replace(/\s/g, "")) &&
      (stripped.match(/\./g) ?? []).length === 1);

  const headerSuggestsMetric =
    Boolean(columnHeader) && METRIC_HEADER_RE.test(columnHeader ?? "");

  // Enteros puros (IDs / conteos) no se formatean salvo header de métrica
  const isPureInteger = Number.isInteger(n) && !hasDecimalSep && !hasPercent;
  if (isPureInteger && !headerSuggestsMetric) return null;
  if (!hasDecimalSep && !hasPercent && !headerSuggestsMetric) return null;

  const formatted = formatArNumber(n);
  return hasPercent ? `${formatted}%` : formatted;
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
