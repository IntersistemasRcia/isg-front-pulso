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
] as const;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2);
}

function spHaystack(sp: SpArquitectura): string[] {
  const name = getSpNombre(sp);
  const params = getSpParametros(sp)
    .map((p) => p.nombre)
    .join(" ");
  return tokenize(`${name} ${params} ${getSpDescripcion(sp)}`);
}

/**
 * Filtra el catálogo a los SP más relevantes para la consulta del usuario.
 * Ranking léxico + señales de metadatos Pulso (TIPO, GRANULARIDAD).
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

  const scored = catalog.map((sp) => {
    const haystack = spHaystack(sp);
    let score = 0;

    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 2;
      if (haystack.some((h) => h.includes(token) || token.includes(h))) score += 1;
    }

    const name = getSpNombre(sp);
    const nameLower = name.toLowerCase();
    const meta = parsePulsoMetadata(getSpDescripcion(sp));
    const masterByName = isMasterListSpName(name);
    const catalogoVerified = isTipoCatalogo(meta);

    if (/venta|factur|ingreso/i.test(userText) && /venta|factur/i.test(nameLower)) score += 3;
    if (/margen|utilidad|ganancia/i.test(userText) && /margen|utilidad|ganancia/i.test(nameLower)) {
      score += 5;
    }
    if (/stock|invent|articulo|artículo/i.test(userText) && /stock|invent|articulo/i.test(nameLower)) {
      score += 3;
    }
    if (/cliente|cuit/i.test(userText) && /cliente/i.test(nameLower)) score += 3;
    if (asksMarcas && /marca/i.test(nameLower) && !/margen/i.test(nameLower)) score += 6;
    if (asksRubros && /rubro/i.test(nameLower) && !/margen|subrubro/i.test(nameLower)) score += 5;
    if (asksRubros && /rubro/i.test(nameLower) && /margen/i.test(nameLower)) score += 2;
    if (asksSubrubros && /subrubro/i.test(nameLower)) score += 6;
    if (asksSucursales && /sucursal/i.test(nameLower) && !/venta|margen/i.test(nameLower)) {
      score += 5;
    }

    // Maestros: Get* o Catalogo_* + metadatos TIPO:CATALOGO (señal primaria)
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
    // Preferir metadatos estructurados frente a nombres solos
    if (meta.hasStructuredFields) score += 2;
    if (catalogoVerified && (asksMarcas || asksRubros || asksSubrubros || asksSucursales)) {
      score += 4;
    }
    // No dejar maestros CATALOGO arriba en pedidos analíticos (MoM/totales/ventas)
    if (
      catalogoVerified &&
      wantsTotalsOrMom &&
      !(asksCatalogList || asksResolveId || asksMarcas || asksRubros || asksSubrubros || asksSucursales)
    ) {
      score -= 8;
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
      /venta|factur|resumen|margen/i.test(nameLower)
    ) {
      score += 4;
    }

    return { sp, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.sp);

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
