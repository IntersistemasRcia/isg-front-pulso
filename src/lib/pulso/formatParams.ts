/**
 * Normaliza valores de parámetros antes de enviarlos a /ejecutar-sp.
 * Fechas → ISO 8601 (YYYY-MM-DD).
 */
export function normalizePulsoParametros(
  parametros: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!parametros) return {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parametros)) {
    result[key] = normalizeValue(value);
  }

  return result;
}

function normalizeValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    // dd/MM/yyyy o yyyy-MM-dd o ISO completo
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === "object") {
    return normalizePulsoParametros(value as Record<string, unknown>);
  }

  return value;
}
