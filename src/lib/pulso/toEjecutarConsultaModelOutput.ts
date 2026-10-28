/**
 * Resumen limpio del tool output para el LLM.
 * En éxitos normales la UI recibe el payload completo (rows, exportId, etc.).
 * En MASTER_MISMATCH el tool ya devolvió ok:false sin filas (hard gate).
 * Evitamos que el modelo copie “UI”, liste 50 filas o invente totales (p.ej. 51 del probe).
 */
export function toEjecutarConsultaModelOutput(output: unknown): {
  type: "text";
  value: string;
} {
  const summary = buildModelSummary(output);
  return { type: "text", value: JSON.stringify(summary) };
}

function buildModelSummary(output: unknown): Record<string, unknown> {
  if (output == null || typeof output !== "object") {
    return {
      ok: false,
      instruccion:
        "Hubo un problema interno. Pedile al usuario reintentar en lenguaje simple.",
    };
  }

  const o = output as Record<string, unknown>;
  const aviso =
    typeof o.avisoUsuario === "string" ? o.avisoUsuario : undefined;

  if (o.ok === false && o.code === "RESULT_LARGE") {
    return {
      ok: false,
      code: "RESULT_LARGE",
      totalExact: o.totalExact === true,
      totalLabel:
        o.totalExact === true && typeof o.totalRows === "number"
          ? String(o.totalRows)
          : "más de 50",
      choices: o.choices,
      filtrosSugeridos: o.optionalParamsHint,
      instruccion:
        aviso ??
        "Hay más de 50 registros. Ofrecé filtrar, ver un adelanto de 50 o Excel con todas. NO digas un total exacto inventado (nunca digas 51).",
    };
  }

  if (o.ok === false) {
    return {
      ok: false,
      code: typeof o.code === "string" ? o.code : undefined,
      missingRequired: o.missingRequired,
      ...(o.masterMismatch != null ? { masterMismatch: o.masterMismatch } : {}),
      instruccion:
        aviso ??
        "Explicá el problema en una frase simple de negocio y pedí lo que falte o reintentar.",
    };
  }

  const uiSilent = o.uiSilent === true || o.uiTable === false;
  const hayExcel =
    !uiSilent && o.delivery === "excel" && typeof o.exportId === "string";
  const totalExact = o.totalExact === true;
  const totalRows =
    totalExact && typeof o.totalRows === "number" ? o.totalRows : undefined;
  const mostrando =
    typeof o.mostrando === "number"
      ? o.mostrando
      : Array.isArray(o.rows)
        ? o.rows.length
        : undefined;

  // Catálogo silencioso: el modelo necesita filas compactas para resolver código.
  const filasMaestro =
    uiSilent && Array.isArray(o.rows)
      ? compactMasterRows(o.rows, 40)
      : undefined;

  if (uiSilent) {
    return {
      ok: true,
      ...(typeof o.code === "string" ? { code: o.code } : {}),
      uiSilent: true,
      hayTablaEnPantalla: false,
      hayExcel: false,
      ...(o.maestroResuelto != null ? { maestroResuelto: o.maestroResuelto } : {}),
      ...(filasMaestro?.length ? { filasMaestro } : {}),
      ...(totalRows != null ? { totalRegistros: totalRows } : {}),
      instruccion:
        aviso ??
        "Catálogo interno (sin UI). Usá maestroResuelto o filasMaestro, ejecutá UNA sola vez el informe de negocio. No presentes este listado ni ofrezcas Excel del catálogo.",
    };
  }

  return {
    ok: true,
    ...(typeof o.code === "string" ? { code: o.code } : {}),
    ...(o.masterMismatch != null ? { masterMismatch: o.masterMismatch } : {}),
    ...(o.maestroResuelto != null ? { maestroResuelto: o.maestroResuelto } : {}),
    hayTablaEnPantalla: o.uiTable === true,
    hayExcel,
    totalExact,
    ...(totalRows != null ? { totalRegistros: totalRows } : {}),
    ...(mostrando != null ? { mostrandoEnPantalla: mostrando } : {}),
    instruccion:
      aviso ??
      (hayExcel
        ? "Hay más de 50 registros: en pantalla ves un adelanto y hay botón para bajar el Excel completo. Decí totalRegistros si viene. No listes filas."
        : "En pantalla está la tabla. Resumí en 1–3 frases de negocio. No digas UI/HTML/tool. No ofrezcas Excel si hayExcel=false."),
  };
}

/** Filas compactas (código + nombre) para que el LLM resuelva sin volcar 60 filas. */
function compactMasterRows(
  rows: unknown[],
  limit: number,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const compact: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (/^(id|codigo|cod)/i.test(k) || /descrip|nombre|name|rubro|marca|sucursal|sector|vendedor/i.test(k)) {
        compact[k] = v;
      }
    }
    out.push(Object.keys(compact).length ? compact : r);
  }
  return out;
}
