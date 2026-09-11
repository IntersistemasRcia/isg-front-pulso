import {
  RESULT_LARGE_THRESHOLD,
  formatKnownTotalLabel,
  type ResolvedResultSize,
} from "@/lib/pulso/resultSizeGate";
import {
  buildExcelSpecFromRows,
  storePulsoExcelExport,
} from "@/lib/pulso/exportStore";
import {
  UI_PREVIEW_MAX_ROWS,
  UI_TABLE_AVISO,
  countRowColumns,
  slicePreviewRows,
} from "@/lib/pulso/tablePreview";

type BaseListadoOptions = {
  nombreSp: string;
  title: string;
  warnings: string[];
  optionalParamHints: string[];
};

function filterHintSentence(hints: string[]): string {
  if (!hints.length) {
    return "Si quiere acotar, pedile un criterio de negocio (nombre parcial, etc.).";
  }
  return `También podés ofrecer filtrar por ${hints.join(", ")} (nombre o parcial).`;
}

/** Resultado chico (≤50): tabla completa, sin Excel. */
export function buildSmallListadoPayload(
  options: BaseListadoOptions & { rows: unknown[] },
): Record<string, unknown> {
  const { nombreSp, rows, warnings } = options;
  const uiRows = slicePreviewRows(rows, UI_PREVIEW_MAX_ROWS);
  const total = rows.length;
  return {
    ok: true,
    uiTable: true,
    nombreSp,
    rows: uiRows,
    previewRows: uiRows,
    totalRows: total,
    totalExact: true,
    mostrando: uiRows.length,
    truncated: false,
    columnCount: countRowColumns(rows),
    warnings: warnings.length ? warnings : undefined,
    avisoUsuario: [
      `Hay ${total} registros; en pantalla está la tabla completa.`,
      "NO ofrezcas Excel (solo cuando hay más de 50).",
      "NO listes las filas en el texto. NO digas UI/HTML/tool.",
      UI_TABLE_AVISO,
    ].join(" "),
  };
}

/**
 * Listado grande en 1ª pasada (probe): adelanto 50 + total si es exacto.
 * Sin Excel (el Excel exige fetch completo / modoResultado=completo).
 */
export function buildLargePreviewPayload(
  options: BaseListadoOptions & {
    previewRows: unknown[];
    size: Pick<ResolvedResultSize, "totalRows" | "totalExact" | "atLeastRows">;
  },
): Record<string, unknown> {
  const { nombreSp, previewRows, size, warnings, optionalParamHints } = options;
  const uiRows = slicePreviewRows(previewRows, RESULT_LARGE_THRESHOLD);
  const totalLabel = formatKnownTotalLabel(size);
  const filterBit = filterHintSentence(optionalParamHints);

  const exactBit = size.totalExact
    ? `Existen ${size.totalRows} registros. En pantalla ves las primeras ${uiRows.length}.`
    : `En pantalla ves un adelanto de ${uiRows.length} registros. Hay ${totalLabel} en total (aún sin COUNT exacto del ERP). NUNCA digas que el total es 51.`;

  return {
    ok: true,
    uiTable: true,
    nombreSp,
    rows: uiRows,
    previewRows: uiRows,
    ...(size.totalExact ? { totalRows: size.totalRows } : {}),
    totalExact: size.totalExact,
    atLeastRows: size.atLeastRows,
    mostrando: uiRows.length,
    truncated: true,
    columnCount: countRowColumns(uiRows),
    warnings: warnings.length ? warnings : undefined,
    avisoUsuario: [
      exactBit,
      size.totalExact
        ? `Ejemplo: «Existen ${size.totalRows} marcas; te muestro las primeras ${uiRows.length}. Si querés todas, pedime el Excel; si preferís, filtramos por nombre.»`
        : "Ofrecé filtrar o pedir el listado completo en Excel (modoResultado=completo) para el total real.",
      filterBit,
      "NO listes filas en el texto. NO ofrezcas Excel todavía (no hay botón hasta modo completo). NO digas UI/HTML/tool.",
      UI_TABLE_AVISO,
    ].join(" "),
  };
}

/** Listado completo materializado: Excel solo si >50; tabla = adelanto ≤50. */
export function buildCompleteListadoPayload(
  options: BaseListadoOptions & { allRows: unknown[] },
): Record<string, unknown> {
  const { nombreSp, allRows, warnings, optionalParamHints } = options;
  const total = allRows.length;
  const uiRows = slicePreviewRows(allRows, UI_PREVIEW_MAX_ROWS);
  const offerExcel = total > RESULT_LARGE_THRESHOLD;
  const spec = offerExcel ? buildExcelSpecFromRows(allRows, options.title) : null;
  const exportId = spec ? storePulsoExcelExport(spec) : undefined;
  const filterBit = filterHintSentence(optionalParamHints);

  if (!offerExcel) {
    return buildSmallListadoPayload({
      ...options,
      rows: allRows,
    });
  }

  return {
    ok: true,
    ...(exportId ? { delivery: "excel" as const, exportId } : {}),
    uiTable: true,
    nombreSp,
    rows: uiRows,
    previewRows: uiRows,
    totalRows: total,
    totalExact: true,
    mostrando: uiRows.length,
    truncated: total > uiRows.length,
    columnCount: countRowColumns(allRows),
    warnings: warnings.length ? warnings : undefined,
    avisoUsuario: [
      `Existen ${total} registros (total exacto). En pantalla ves las primeras ${uiRows.length}` +
        (exportId
          ? `; abajo hay un botón para bajar el Excel con las ${total}.`
          : "."),
      `Ejemplo: «Existen ${total} marcas; te muestro las primeras ${uiRows.length}. Si querés todas, bajá el Excel.»`,
      filterBit,
      "NO digas 51 ni otro total. NO listes marcas en el texto. NO digas UI/HTML/tool.",
      UI_TABLE_AVISO,
    ].join(" "),
  };
}
