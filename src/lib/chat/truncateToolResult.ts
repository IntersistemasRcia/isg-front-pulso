const MAX_ROWS = 50;
const MAX_BYTES = 8 * 1024;

/**
 * Limita el tamaño del resultado de un SP antes de devolverlo al LLM.
 * Evita saturar el contexto con tablas enormes.
 */
export function truncateToolResult(result: unknown): unknown {
  if (result == null) return result;

  if (Array.isArray(result)) {
    const totalRows = result.length;
    const rows = result.slice(0, MAX_ROWS);
    const payload = {
      rows,
      totalRows,
      truncated: totalRows > MAX_ROWS,
    };
    return enforceByteLimit(payload);
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
          [key]: list.slice(0, MAX_ROWS),
          totalRows,
          truncated: totalRows > MAX_ROWS || Boolean(obj.truncated),
        });
      }
    }

    return enforceByteLimit(obj);
  }

  return enforceByteLimit({ value: result });
}

function enforceByteLimit(payload: unknown): unknown {
  const json = JSON.stringify(payload);
  if (json.length <= MAX_BYTES) return payload;

  return {
    truncated: true,
    message: `Resultado truncado a ${MAX_BYTES} bytes para eficiencia del contexto.`,
    preview: json.slice(0, MAX_BYTES),
    originalBytes: json.length,
  };
}
