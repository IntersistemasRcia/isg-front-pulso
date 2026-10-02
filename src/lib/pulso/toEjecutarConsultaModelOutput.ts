/**
 * Resumen limpio del tool output para el LLM.
 * La UI del cliente sigue recibiendo el output completo (rows, exportId, etc.).
 * Así evitamos que el modelo copie “UI”, liste 50 filas o invente totales (p.ej. 51 del probe).
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
      instruccion:
        aviso ??
        "Explicá el problema en una frase simple de negocio y pedí lo que falte o reintentar.",
    };
  }

  const hayExcel = o.delivery === "excel" && typeof o.exportId === "string";
  const totalExact = o.totalExact === true;
  const totalRows =
    totalExact && typeof o.totalRows === "number" ? o.totalRows : undefined;
  const mostrando =
    typeof o.mostrando === "number"
      ? o.mostrando
      : Array.isArray(o.rows)
        ? o.rows.length
        : undefined;

  return {
    ok: true,
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
