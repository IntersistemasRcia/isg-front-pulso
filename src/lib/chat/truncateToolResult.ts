export type TruncateToolResultOptions = {
  maxRows?: number;
  maxBytes?: number;
};

const DEFAULT_MAX_ROWS = 50;
const DEFAULT_MAX_BYTES = 8 * 1024;

/**
 * Limita el tamaño del resultado de un SP antes de devolverlo al LLM.
 * Evita saturar el contexto con tablas enormes.
 */
export function truncateToolResult(
  result: unknown,
  options?: TruncateToolResultOptions,
): unknown {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  if (result == null) return result;

  if (Array.isArray(result)) {
    const totalRows = result.length;
    const rows = result.slice(0, maxRows);
    const payload = {
      rows,
      totalRows,
      truncated: totalRows > maxRows,
    };
    return enforceByteLimit(payload, maxBytes);
  }

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;

    // Formatos comunes: { data: [] } | { rows: [] } | { result: [] }
    for (const key of ["data", "rows", "result", "records"] as const) {
      if (Array.isArray(obj[key])) {
        const list = obj[key] as unknown[];
        const totalRows = list.length;
        return enforceByteLimit({
          ...obj,
          [key]: list.slice(0, maxRows),
          totalRows,
          truncated: totalRows > maxRows || Boolean(obj.truncated),
        }, maxBytes);
      }
    }

    return enforceByteLimit(obj, maxBytes);
  }

  return enforceByteLimit({ value: result }, maxBytes);
}

function enforceByteLimit(payload: unknown, maxBytes: number): unknown {
  const json = JSON.stringify(payload);
  if (json.length <= maxBytes) return payload;

  return {
    truncated: true,
    message: `Resultado truncado a ${maxBytes} bytes para eficiencia del contexto.`,
    preview: json.slice(0, maxBytes),
    originalBytes: json.length,
  };
}
