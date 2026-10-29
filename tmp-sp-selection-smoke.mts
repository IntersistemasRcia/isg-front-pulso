/**
 * Smoke: ranker reposición + FILTER_PARAM_OMITTED.
 * Run: npx --yes tsx tmp-sp-selection-smoke.mts
 */
import { selectRelevantSps } from "./src/lib/pulso/selectRelevantSps";
import { detectOmittedMasterFilters } from "./src/lib/pulso/masterFilterPolicy";
import { coerceParamsForSp } from "./src/lib/pulso/spParamResolver";
import type { SpArquitectura } from "./src/lib/pulso/types";

const userQuery =
  "necesito planificar cantidades a comprar para cubrir en una semana... quiero un nuevo informe de ventas para los articulos que sean del rubro Fiambres, en el periodo del 01/08/2026 al 12/08/2026, detallado por artículo para la sucursal de resistencia";

const catalog: SpArquitectura[] = [
  {
    nombre: "sp_ISG_Vision_Catalogo_Rubros",
    descripcion:
      "TIPO: CATALOGO. PROPÓSITO: Listar rubros. GRANULARIDAD: RUBRO. USAR CUANDO: Resolver código de rubro por nombre.",
    parametros: [],
  },
  {
    nombre: "sp_ISG_Vision_Catalogo_Sucursales",
    descripcion:
      "TIPO: CATALOGO. PROPÓSITO: Listar sucursales. GRANULARIDAD: SUCURSAL. USAR CUANDO: Resolver código de sucursal.",
    parametros: [],
  },
  {
    nombre: "sp_ISG_Vision_rankingventas_por_articulo",
    descripcion:
      "TIPO: ANALISIS. PROPÓSITO: Ranking de ventas por artículo. GRANULARIDAD: ARTÍCULO. USAR CUANDO: Ranking o informe de ventas por artículo. NO USAR PARA: Planificar cantidades a comprar o reposición.",
    parametros: [
      { nombre: "FechaDesde", tipo: "date", requerido: true },
      { nombre: "FechaHasta", tipo: "date", requerido: true },
      // Sin IDRubro en firma (como en el fallo real)
    ],
  },
  {
    nombre: "sp_ISG_Vision_reposicion_por_articulo",
    descripcion:
      "TIPO: ANALISIS. PROPÓSITO: Estimar la necesidad de reposición en unidades de venta por artículo y sucursal. GRANULARIDAD: ARTÍCULO Y SUCURSAL. USAR CUANDO: Se necesite planificar cantidades a comprar para cubrir un número de días, para un artículo, rubro, subrubro o todos. NO USAR PARA: Ranking de ventas o MoM.",
    parametros: [
      { nombre: "FechaDesde", tipo: "date", requerido: true },
      { nombre: "FechaHasta", tipo: "date", requerido: true },
      { nombre: "DiasReposicion", tipo: "int", requerido: true },
      { nombre: "Articulo", tipo: "varchar", requerido: false },
      { nombre: "IDRubro", tipo: "int", requerido: false },
      { nombre: "IDSubrubro", tipo: "int", requerido: false },
      { nombre: "IDSucursal", tipo: "smallint", requerido: false },
    ],
  },
];

const selected = selectRelevantSps(userQuery, catalog, 4);
const names = selected.map((s) => String(s.nombre ?? s.name));
console.log("selected", names);

const reposicionIdx = names.findIndex((n) => /reposicion/i.test(n));
const rankingIdx = names.findIndex((n) => /rankingventas/i.test(n));
console.log("reposicionIdx", reposicionIdx, "rankingIdx", rankingIdx);

const rankOk =
  reposicionIdx >= 0 && (rankingIdx < 0 || reposicionIdx < rankingIdx);

// Coerce: IDRubro omitido en rankingventas
const coercedRanking = coerceParamsForSp(
  "sp_ISG_Vision_rankingventas_por_articulo",
  {
    FechaDesde: "01/08/2026",
    FechaHasta: "12/08/2026",
    IDRubro: 2103,
  },
  catalog,
);
console.log("coercedRanking", {
  params: coercedRanking.parametros,
  warnings: coercedRanking.warnings,
});

const omitted = detectOmittedMasterFilters({
  userText: userQuery,
  rawParams: {
    FechaDesde: "01/08/2026",
    FechaHasta: "12/08/2026",
    IDRubro: 2103,
  },
  coercedParams: coercedRanking.parametros,
});
console.log("omitted", omitted);

const gateOk =
  omitted.length === 1 &&
  omitted[0]!.dimension === "rubro" &&
  omitted[0]!.attemptedKey === "IDRubro";

// Coerce feliz en reposición
const coercedRepo = coerceParamsForSp(
  "sp_ISG_Vision_reposicion_por_articulo",
  {
    FechaDesde: "01/08/2026",
    FechaHasta: "12/08/2026",
    DiasReposicion: 7,
    IDRubro: 2103,
    IDSucursal: 1,
  },
  catalog,
);
const repoParamsOk =
  coercedRepo.parametros.IDRubro === 2103 &&
  coercedRepo.parametros.IDSucursal === 1 &&
  coercedRepo.parametros.DiasReposicion === 7;

const omittedRepo = detectOmittedMasterFilters({
  userText: userQuery,
  rawParams: {
    FechaDesde: "01/08/2026",
    FechaHasta: "12/08/2026",
    DiasReposicion: 7,
    IDRubro: 2103,
    IDSucursal: 1,
  },
  coercedParams: coercedRepo.parametros,
});
console.log("omittedRepo", omittedRepo, "repoParamsOk", repoParamsOk);

const pass =
  rankOk && gateOk && repoParamsOk && omittedRepo.length === 0;

console.log(pass ? "PASS" : "FAIL", {
  rankOk,
  gateOk,
  repoParamsOk,
  omittedRepoEmpty: omittedRepo.length === 0,
});
process.exit(pass ? 0 : 1);
