/**
 * Smoke: hard MASTER_MISMATCH + maestroResuelto (Fiambres → 2103).
 * Run: npx --yes tsx tmp-master-smoke.mts
 */
import {
  detectMasterMismatch,
  appendMasterMismatchHint,
  resolveMasterFromCatalogRows,
  appendMaestroResueltoHint,
  makeMasterLookupSilent,
  userAskedForMasterCatalogList,
} from "./src/lib/pulso/masterFilterPolicy";

const userFiambres =
  "informe de ventas del rubro Fiambres del 01/08/2026 al 12/08/2026 sucursal Resistencia";

const mismatch = detectMasterMismatch({
  userText: userFiambres,
  parametros: { IDRubro: 2101, IDSucursal: 1 },
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
  askedReport === false;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
