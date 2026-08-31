import type { SpArquitectura } from "@/lib/pulso/types";
import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";

const DEFAULT_TOP_K = 8;

/** SPs frecuentes como fallback cuando la consulta no matchea nada. */
const CORE_SP_KEYWORDS = [
  "venta",
  "resumen",
  "dashboard",
  "kpi",
  "cliente",
  "stock",
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
  return tokenize(`${name} ${params} ${sp.descripcion ?? ""}`);
}

/**
 * Filtra el catálogo a los SP más relevantes para la consulta del usuario.
 * Ranking léxico barato (sin embeddings) — reutiliza el patrón de selectActiveTools.
 */
export function selectRelevantSps(
  userText: string,
  catalog: SpArquitectura[],
  topK = DEFAULT_TOP_K,
): SpArquitectura[] {
  if (catalog.length <= topK) return catalog;

  const queryTokens = tokenize(userText);
  if (queryTokens.length === 0) {
    return pickCoreFallback(catalog, topK);
  }

  const scored = catalog.map((sp) => {
    const haystack = spHaystack(sp);
    let score = 0;

    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 2;
      if (haystack.some((h) => h.includes(token) || token.includes(h))) score += 1;
    }

    const name = getSpNombre(sp).toLowerCase();
    if (/venta|factur|ingreso/i.test(userText) && /venta|factur/i.test(name)) score += 3;
    if (/stock|invent|articulo|artículo/i.test(userText) && /stock|invent|articulo/i.test(name)) {
      score += 3;
    }
    if (/cliente|cuit/i.test(userText) && /cliente/i.test(name)) score += 3;
    if (/kpi|indicador|dashboard|resumen/i.test(userText) && /kpi|dashboard|resumen/i.test(name)) {
      score += 3;
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
