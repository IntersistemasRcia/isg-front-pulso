import type { SpArquitectura } from "@/lib/pulso/types";
import { getSpDescripcion, getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import {
  isMasterListSpName,
  isTipoCatalogo,
  parsePulsoMetadata,
} from "@/lib/pulso/parsePulsoMetadata";

const DEFAULT_TOP_K = 8;

/** SPs frecuentes como fallback cuando la consulta no matchea nada. */
const CORE_SP_KEYWORDS = [
  "venta",
  "resumen",
  "dashboard",
  "kpi",
  "cliente",
  "stock",
  "marca",
  "rubro",
  "catalogo",
  "get",
  "reposicion",
] as const;

/** Dimensiones de filtro pedidas en el texto → patrones de nombre de param. */
const FILTER_DIMENSIONS: Array<{
  id: string;
  userHint: RegExp;
  paramPattern: RegExp;
}> = [
  {
    id: "subrubro",
    userHint: /\bsub[\s_-]?rubros?\b/i,
    paramPattern: /^(id)?subrubro$|^codigosubrubro$/,
  },
  {
    id: "rubro",
    userHint: /\brubros?\b/i,
    // Tras normalizeParamKey: idrubro / rubro / codigorubro (no subrubro).
    paramPattern: /^(id)?rubro$|^codigorubro$/,
  },
  {
    id: "sucursal",
    userHint: /\bsucursales?\b|\bsucursal\b|resistencia/i,
    paramPattern: /^(id)?sucursal$|^codigosucursal$/,
  },
  {
    id: "articulo",
    userHint: /\bart[ií]culos?\b/i,
    paramPattern: /^(id)?articulo$|^codigoarticulo$/,
  },
  {
    id: "marca",
    userHint: /\bmarcas?\b/i,
    paramPattern: /^(id)?marca$|^codigomarca$/,
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2);
}

function normalizeParamKey(name: string): string {
  return name
    .replace(/^@/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function spHaystack(sp: SpArquitectura): string[] {
  const name = getSpNombre(sp);
  const params = getSpParametros(sp)
    .map((p) => p.nombre)
    .join(" ");
  return tokenize(`${name} ${params} ${getSpDescripcion(sp)}`);
}

function overlapScore(queryTokens: string[], fieldText: string | undefined): number {
  if (!fieldText?.trim() || queryTokens.length === 0) return 0;
  const fieldTokens = new Set(tokenize(fieldText));
  let score = 0;
  for (const t of queryTokens) {
    if (fieldTokens.has(t)) score += 2;
    else if ([...fieldTokens].some((f) => f.includes(t) || t.includes(f))) score += 1;
  }
  return score;
}

function askedFilterDimensions(userText: string): string[] {
  return FILTER_DIMENSIONS.filter((d) => d.userHint.test(userText)).map((d) => d.id);
}

function spParamNorms(sp: SpArquitectura): string[] {
  return getSpParametros(sp).map((p) => normalizeParamKey(p.nombre));
}

function spHasFilterCapability(paramNorms: string[], dimId: string): boolean {
  const dim = FILTER_DIMENSIONS.find((d) => d.id === dimId);
  if (!dim) return false;
  return paramNorms.some((n) => dim.paramPattern.test(n));
}

function isReposicionSp(nameLower: string, metaText: string): boolean {
  return (
    /reposicion|reponer/i.test(nameLower) ||
    /reposicion|reponer|comprar|stock objetivo|dias de stock|d[ií]as a cubrir/i.test(
      metaText,
    )
  );
}

/**
 * Filtra el catálogo a los SP más relevantes para la consulta del usuario.
 * Ranking léxico + intención (reposición) + capacidad de params + metadatos Pulso.
 */
export function selectRelevantSps(
  userText: string,
  catalog: SpArquitectura[],
  topK = DEFAULT_TOP_K,
): SpArquitectura[] {
  const queryTokens = tokenize(userText);
  if (queryTokens.length === 0) {
    return pickCoreFallback(catalog, topK);
  }

  const asksCatalogList =
    /catalogo|catálogo|listado|lista de|listar|maestro/i.test(userText);
  const asksResolveId =
    /por\s+nombre|c[oó]digo\s+de|resolv|buscar\s+(el\s+)?(rubro|subrubro|sucursal|marca|vendedor)/i.test(
      userText,
    );
  const asksMarcas = /marca/i.test(userText);
  const asksRubros = /rubro/i.test(userText);
  const asksSubrubros = /subrubro/i.test(userText);
  const asksSucursales = /sucursal|resistencia|localidad/i.test(userText);
  const wantsTotalsOrMom =
    /total(es)?|evoluci[oó]n|mes\s+a\s+mes|creci[oó]|baj[oó]|comparat|mom|periodo|período/i.test(
      userText,
    );
  const wantsComprobanteDetail =
    /comprobante|factura\s+por\s+factura|detalle\s+de\s+venta/i.test(userText);

  const wantsReposicion =
    /reposici[oó]n|reponer|planificar|cantidades?\s+a\s+comprar|cu[aá]nto\s+comprar|a\s+comprar|cubrir\s+(en\s+)?(una\s+)?(semana|\d+\s*d[ií]as)|d[ií]as\s+de\s+stock|stock\s+objetivo|necesidad\s+de\s+reposici/i.test(
      userText,
    );

  const wantsVentasRanking =
    /ranking\s+de\s+ventas|informe\s+de\s+ventas|ventas?\s+por\s+art[ií]culo/i.test(
      userText,
    ) && !wantsReposicion;

  const filterDims = askedFilterDimensions(userText);
  const analyticalPedido =
    wantsReposicion ||
    wantsTotalsOrMom ||
    wantsVentasRanking ||
    /\binforme\b|\banaliz|\bventas?\b|\bmargen\b/i.test(userText);

  const scored = catalog.map((sp) => {
    const haystack = spHaystack(sp);
    let score = 0;

    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 2;
      if (haystack.some((h) => h.includes(token) || token.includes(h))) score += 1;
    }

    const name = getSpNombre(sp);
    const nameLower = name.toLowerCase();
    const desc = getSpDescripcion(sp);
    const meta = parsePulsoMetadata(desc);
    const masterByName = isMasterListSpName(name);
    const catalogoVerified = isTipoCatalogo(meta);
    const paramNorms = spParamNorms(sp);
    const metaBlob = [meta.usarCuando, meta.proposito, meta.noUsarPara]
      .filter(Boolean)
      .join(" ");

    // Overlap explícito con campos estructurados Pulso
    score += overlapScore(queryTokens, meta.usarCuando);
    score += overlapScore(queryTokens, meta.proposito);
    const noUsarHit = overlapScore(queryTokens, meta.noUsarPara);
    if (noUsarHit > 0) score -= Math.min(8, noUsarHit);

    if (/venta|factur|ingreso/i.test(userText) && /venta|factur/i.test(nameLower)) {
      score += wantsReposicion ? 1 : 3;
    }
    if (/margen|utilidad|ganancia/i.test(userText) && /margen|utilidad|ganancia/i.test(nameLower)) {
      score += 5;
    }
    if (/stock|invent|articulo|artículo/i.test(userText) && /stock|invent|articulo/i.test(nameLower)) {
      score += 3;
    }
    if (/cliente|cuit/i.test(userText) && /cliente/i.test(nameLower)) score += 3;
    if (asksMarcas && /marca/i.test(nameLower) && !/margen/i.test(nameLower)) score += 6;
    if (asksRubros && /rubro/i.test(nameLower) && !/margen|subrubro/i.test(nameLower)) {
      score += analyticalPedido && !catalogoVerified ? 2 : 5;
    }
    if (asksRubros && /rubro/i.test(nameLower) && /margen/i.test(nameLower)) score += 2;
    if (asksSubrubros && /subrubro/i.test(nameLower)) score += 6;
    if (asksSucursales && /sucursal/i.test(nameLower) && !/venta|margen/i.test(nameLower)) {
      score += analyticalPedido && !catalogoVerified ? 2 : 5;
    }

    // Maestros: Get* o Catalogo_* + metadatos TIPO:CATALOGO
    if ((asksCatalogList || asksResolveId) && catalogoVerified) score += 12;
    if ((asksCatalogList || asksResolveId) && masterByName && catalogoVerified) score += 4;
    if ((asksCatalogList || asksResolveId) && masterByName && !catalogoVerified) score += 3;
    if (asksCatalogList && masterByName) score += 8;
    if (asksCatalogList && asksMarcas && /marca/i.test(nameLower) && catalogoVerified) score += 10;
    if (
      asksCatalogList &&
      asksRubros &&
      /rubro/i.test(nameLower) &&
      !/margen/i.test(nameLower) &&
      catalogoVerified
    ) {
      score += 10;
    }
    if (meta.hasStructuredFields) score += 2;

    // Catálogos ayudan a resolver códigos, pero no deben ganar el top ante un pedido analítico
    if (catalogoVerified && (asksMarcas || asksRubros || asksSubrubros || asksSucursales)) {
      score += analyticalPedido && !asksCatalogList ? 1 : 4;
    }
    if (
      catalogoVerified &&
      wantsTotalsOrMom &&
      !(asksCatalogList || asksResolveId || asksMarcas || asksRubros || asksSubrubros || asksSucursales)
    ) {
      score -= 8;
    }
    if (catalogoVerified && wantsReposicion && !asksCatalogList) {
      score -= 6;
    }

    const gran = (meta.granularidad ?? "").toUpperCase();
    if (wantsTotalsOrMom && /COMPROBANTE/i.test(gran) && !wantsComprobanteDetail) {
      score -= 6;
    }
    if (wantsTotalsOrMom && /PER[IÍ]ODO|DIA|DÍA|MES|ART[IÍ]CULO/i.test(gran)) {
      score += 4;
    }
    if (wantsComprobanteDetail && /COMPROBANTE/i.test(gran)) score += 5;

    if (/kpi|indicador|dashboard|resumen/i.test(userText) && /kpi|dashboard|resumen/i.test(nameLower)) {
      score += 3;
    }
    if (
      /semana|mes|abril|enero|febrero|marzo|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i.test(
        userText,
      ) &&
      /venta|factur|resumen|margen/i.test(nameLower) &&
      !wantsReposicion
    ) {
      score += 4;
    }

    // —— Intención reposición ——
    const reposicionLike = isReposicionSp(nameLower, `${desc} ${metaBlob}`);
    if (wantsReposicion && reposicionLike) {
      score += 18;
      if (/reposicion/i.test(nameLower)) score += 6;
    }
    if (wantsReposicion && /ranking|venta/i.test(nameLower) && !reposicionLike) {
      score -= 10;
    }
    if (wantsVentasRanking && /ranking.*venta|venta.*ranking|rankingventas/i.test(nameLower)) {
      score += 10;
    }

    // —— Capacidad de filtros (params del SP) ——
    if (!catalogoVerified && filterDims.length > 0) {
      let matched = 0;
      for (const dimId of filterDims) {
        if (spHasFilterCapability(paramNorms, dimId)) {
          matched += 1;
          score += 5;
        } else {
          score -= 4;
        }
      }
      if (matched === filterDims.length && filterDims.length > 0) score += 3;
    }

    return { sp, score, nameLower, reposicionLike };
  });

  scored.sort((a, b) => b.score - a.score);

  let selected = scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.sp);

  // Slot garantizado: al menos un SP de reposición en el topK
  if (wantsReposicion) {
    const hasReposicion = selected.some((sp) =>
      isReposicionSp(
        getSpNombre(sp).toLowerCase(),
        getSpDescripcion(sp),
      ),
    );
    if (!hasReposicion) {
      const bestReposicion = scored.find((s) => s.reposicionLike && s.score > 0);
      if (bestReposicion) {
        if (selected.length >= topK) selected = selected.slice(0, topK - 1);
        selected = [bestReposicion.sp, ...selected];
      }
    }
  }

  if (selected.length > 0) return selected;
  return pickCoreFallback(catalog, topK);
}

function pickCoreFallback(catalog: SpArquitectura[], topK: number): SpArquitectura[] {
  const core = catalog.filter((sp) => {
    const name = getSpNombre(sp).toLowerCase();
    return CORE_SP_KEYWORDS.some((kw) => name.includes(kw));
  });

  if (core.length >= Math.min(3, topK)) {
    return core.slice(0, topK);
  }

  return catalog.slice(0, topK);
}
