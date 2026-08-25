import type { StoredProcedureTool } from "@/types";
import { SP_TOOLS_CATALOG } from "@/utils/spCatalog";

/** Tools “core” siempre disponibles como fallback de negocio. */
const CORE_TOOL_NAMES = [
  "sp_KPI_Dashboard",
  "sp_Ventas_PorPeriodo",
  "sp_Clientes_Buscar",
] as const;

const DEFAULT_TOP_K = 4;

/**
 * Selecciona 3–4 tools relevantes según el último mensaje del usuario.
 * Ranking léxico sobre name + description (barato, sin embeddings).
 */
export function selectActiveTools(
  userText: string,
  catalog: StoredProcedureTool[] = SP_TOOLS_CATALOG,
  topK = DEFAULT_TOP_K,
): StoredProcedureTool[] {
  const queryTokens = tokenize(userText);

  if (queryTokens.length === 0) {
    return resolveCore(catalog);
  }

  const scored = catalog.map((tool) => {
    const haystack = tokenize(`${tool.name} ${tool.description}`);
    let score = 0;

    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 2;
      // coincidencia parcial (p.ej. "venta" en "ventas")
      if (haystack.some((h) => h.includes(token) || token.includes(h))) score += 1;
    }

    // boost por keywords de dominio frecuentes
    if (/venta|factur|ingreso/i.test(userText) && /venta|factur/i.test(tool.name)) {
      score += 3;
    }
    if (/stock|invent|articulo|artículo/i.test(userText) && /stock|invent|articulo|precio/i.test(tool.name)) {
      score += 3;
    }
    if (/cliente|cuit/i.test(userText) && /cliente/i.test(tool.name)) {
      score += 3;
    }
    if (/kpi|indicador|dashboard/i.test(userText) && /kpi/i.test(tool.name)) {
      score += 3;
    }

    return { tool, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.tool);

  if (selected.length === 0) {
    return resolveCore(catalog);
  }

  // Asegurar al menos un core si el set es muy estrecho
  const byName = new Map(selected.map((t) => [t.name, t]));
  for (const coreName of CORE_TOOL_NAMES) {
    if (byName.size >= topK) break;
    const found = catalog.find((t) => t.name === coreName);
    if (found && !byName.has(found.name)) {
      byName.set(found.name, found);
    }
  }

  return Array.from(byName.values()).slice(0, topK);
}

function resolveCore(catalog: StoredProcedureTool[]): StoredProcedureTool[] {
  const core = CORE_TOOL_NAMES.map((name) =>
    catalog.find((t) => t.name === name),
  ).filter((t): t is StoredProcedureTool => Boolean(t));

  return core.length > 0 ? core : catalog.slice(0, DEFAULT_TOP_K);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2);
}
