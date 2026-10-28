/**
 * Smoke: hard MASTER_MISMATCH + maestroResuelto + sticky last-turn.
 * Run: npx --yes tsx tmp-master-smoke.mts
 */
import {
  detectMasterMismatch,
  appendMasterMismatchHint,
  resolveMasterFromCatalogRows,
  appendMaestroResueltoHint,
  makeMasterLookupSilent,
  userAskedForMasterCatalogList,
  extractMasterIntents,
} from "./src/lib/pulso/masterFilterPolicy";
import { buildLastUserQueryText } from "./src/lib/chat/buildUserQueryContext";
import type { UIMessage } from "ai";

const userFiambres =
  "informe de ventas del rubro Fiambres del 01/08/2026 al 12/08/2026 sucursal Resistencia";

// Nombre pedido ≠ etiquetas (sin params que alineen con las filas).
const mismatch = detectMasterMismatch({
  userText: userFiambres,
  parametros: {},
  previewRows: [
    {
      Articulo: "1488",
      IDRubro: 2101,
      Rubro: "QUESOS",
      DescripcionArticulo: "Z-QUESO CREMOSO NOAL",
    },
  ],
  nombreSp: "sp_ISG_Vision_reposicion_por_articulo",
});

console.log(
  "mismatch",
  mismatch
    ? {
        code: mismatch.code,
        dim: mismatch.dimension,
        expected: mismatch.expectedName,
        samples: mismatch.sampleLabels,
      }
    : null,
);

const gated = appendMasterMismatchHint(
  {
    ok: true,
    uiTable: true,
    rows: [{ Rubro: "QUESOS" }],
    nombreSp: "sp_ISG_Vision_reposicion_por_articulo",
    exportId: "should-be-gone",
  },
  mismatch,
);
console.log("gated", {
  ok: gated.ok,
  code: gated.code,
  hasRows: "rows" in gated,
  hasExport: "exportId" in gated,
  hasUiTable: "uiTable" in gated,
});

const catalogRows = [
  { IDRubro: 2101, Descripcion: "QUESOS" },
  { IDRubro: 2103, Descripcion: "FIAMBRES" },
  { IDRubro: 2107, Descripcion: "EMBUTIDOS" },
];

const resolved = resolveMasterFromCatalogRows({
  userText: userFiambres,
  nombreSp: "sp_ISG_Vision_Catalogo_Rubros",
  rows: catalogRows,
});
console.log("resolved", resolved);

const withHint = appendMaestroResueltoHint(
  { ok: true, uiTable: true, nombreSp: "sp_ISG_Vision_Catalogo_Rubros" },
  resolved,
);
console.log("maestroHint", {
  code: withHint.code,
  codigo: (withHint.maestroResuelto as { codigo?: string } | undefined)?.codigo,
  avisoHasCodigo:
    typeof withHint.avisoUsuario === "string" &&
    withHint.avisoUsuario.includes("CÓDIGO 2103"),
  avisoNoIdAsk:
    typeof withHint.avisoUsuario === "string" &&
    withHint.avisoUsuario.includes("nunca «ID»"),
});

const catalogMismatch = detectMasterMismatch({
  userText: userFiambres,
  parametros: {},
  previewRows: catalogRows,
  nombreSp: "sp_ISG_Vision_Catalogo_Rubros",
});
console.log("catalogDetectNull", catalogMismatch === null);

const silent = makeMasterLookupSilent({
  ok: true,
  uiTable: true,
  delivery: "excel",
  exportId: "x",
  nombreSp: "sp_ISG_Vision_Catalogo_Rubros",
  rows: catalogRows,
});
console.log("silent", {
  uiTable: silent.uiTable,
  uiSilent: silent.uiSilent,
  hasExport: "exportId" in silent,
  hasDelivery: "delivery" in silent,
});

const askedCatalog = userAskedForMasterCatalogList(
  "dame el listado de rubros disponibles",
);
const askedReport = userAskedForMasterCatalogList(userFiambres);
console.log("asked", { askedCatalog, askedReport });

// ── Sticky: último turno Fiambres no choca con Quesos del hilo ─────────────
const lastFiambres = "Si quiero de fiambres del rubro codigo 2103";
const stickyMismatch = detectMasterMismatch({
  userText: lastFiambres,
  parametros: {
    RubroDesde: 2103,
    RubroHasta: 2103,
    ObjetivoVentaPct: 100,
    ConImpuestos: 1,
  },
  previewRows: [
    {
      ARTICULO: "1",
      DescripcionArticulo: "JAMON",
      IDRubro: 2103,
      Rubro: "FIAMBRES",
    },
  ],
  nombreSp: "sp_ISG_Vision_rankingventas_por_articulo",
});
console.log("stickyMismatch", stickyMismatch);

// Backup: params code calza aunque nameHint viejo diga Quesos
const paramsAlignSkip = detectMasterMismatch({
  userText: "ranking del rubro Quesos",
  parametros: { RubroDesde: 2103, RubroHasta: 2103 },
  previewRows: [{ IDRubro: 2103, Rubro: "FIAMBRES" }],
  nombreSp: "sp_ISG_Vision_rankingventas_por_articulo",
});
console.log("paramsAlignSkip", paramsAlignSkip);

// Parse: «codigo de rubro quesos es 2101 no el 2098»
const parseCorrection = extractMasterIntents(
  "Si pero el codigo de rubro quesos es 2101 no el 2098",
);
const rubroParse = parseCorrection.find((i) => i.dimension.id === "rubro");
console.log("parseCorrection", rubroParse);

const resolvedFiambresOnly = resolveMasterFromCatalogRows({
  userText: "prefiero un ranking de ventas del mismo periodo pero de fiambres del rubro Fiambres",
  nombreSp: "sp_ISG_Vision_Catalogo_Rubros",
  rows: catalogRows,
});
console.log("resolvedFiambresOnly", resolvedFiambresOnly);

const lastText = buildLastUserQueryText([
  {
    id: "1",
    role: "user",
    parts: [{ type: "text", text: "ranking rubro quesos" }],
  },
  {
    id: "2",
    role: "assistant",
    parts: [{ type: "text", text: "ok" }],
  },
  {
    id: "3",
    role: "user",
    parts: [{ type: "text", text: lastFiambres }],
  },
] as UIMessage[]);
console.log("lastUserText", lastText === lastFiambres);

const pass =
  mismatch?.code === "MASTER_MISMATCH" &&
  mismatch.expectedName?.toLowerCase().includes("fiambre") &&
  gated.ok === false &&
  !("rows" in gated) &&
  resolved?.codigo === "2103" &&
  resolved.exacto === true &&
  catalogMismatch === null &&
  silent.uiSilent === true &&
  silent.uiTable === false &&
  !("exportId" in silent) &&
  askedCatalog === true &&
  askedReport === false &&
  stickyMismatch === null &&
  paramsAlignSkip === null &&
  rubroParse?.code === "2101" &&
  rubroParse?.nameHint != null &&
  !/es\s+2101/i.test(rubroParse.nameHint) &&
  /queso/i.test(rubroParse.nameHint) &&
  resolvedFiambresOnly?.codigo === "2103" &&
  lastText === lastFiambres;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
