/**
 * Smoke: ParamIntentPolicy — ranking CANTIDAD / Objetivo 100 / cerrar rangos.
 * Run: npx --yes tsx tmp-ranking-smoke.mts
 */
import { applyParamIntentOverrides } from "./src/lib/pulso/paramIntentPolicy";

const userCantidad =
  "mostrame un ranking de ventas del rubro: FIAMBRES, subrubros: COCIDOS, del 01/08/2026 al 12/08/2026 que este ordenado por cantidad de articulos vendidos";

const a = applyParamIntentOverrides({
  nombreSp: "sp_ISG_Vision_rankingventas_por_articulo",
  userText: userCantidad,
  params: {
    FechaDesde: "01/08/2026",
    FechaHasta: "12/08/2026",
    ConImpuestos: 1,
    RubroDesde: 2103,
    SubrubroDesde: 811,
    ObjetivoVentaPct: 80,
    // LLM olvidó TipoRanking → SQL default IMPORTE
  },
});

console.log("cantidad", a.params, a.applied);

const b = applyParamIntentOverrides({
  nombreSp: "sp_ISG_Vision_rankingventas_por_articulo",
  userText: "ranking de ventas por importe top 80% del rubro fiambres",
  params: { RubroDesde: 2103 },
});

console.log("importe80", b.params, b.applied);

const c = applyParamIntentOverrides({
  nombreSp: "sp_ISG_Vision_Catalogo_Rubros",
  userText: userCantidad,
  params: {},
});

console.log("catalogNoop", c.params, c.applied);

const pass =
  a.params.TipoRanking === "CANTIDAD" &&
  a.params.ObjetivoVentaPct === 100 &&
  a.params.RubroHasta === 2103 &&
  a.params.SubrubroHasta === 811 &&
  b.params.TipoRanking === "IMPORTE" &&
  b.params.ObjetivoVentaPct === 80 &&
  b.params.RubroHasta === 2103 &&
  c.applied.length === 0;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
