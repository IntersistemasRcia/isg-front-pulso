import { fetchSpsArquitectura } from "@/lib/pulso/client";
import { formatSpParamHint } from "@/lib/pulso/spParamResolver";
import type { SpArquitectura, SpParametroArquitectura } from "@/lib/pulso/types";

export type PromptCatalogMode = "full" | "compact" | "minimal" | "tool-only";

/** Cache corto: el catálogo slim viene de sys.parameters en isg-api-pulso. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  items: SpArquitectura[];
};

const cacheByToken = new Map<string, CacheEntry>();

function logArquitecturaLoaded(items: SpArquitectura[]): void {
  if (process.env.NODE_ENV === "production") return;
  const withParams = items.filter((sp) => (sp.parametros?.length ?? 0) > 0).length;
  console.info(
    `[pulso] SPs_arquitectura slim: ${items.length} SP(s), ${withParams} con parámetros (sys.parameters).`,
  );
}

/**
 * Obtiene el catálogo de SPs con cache en memoria (respuesta slim del API).
 */
export async function getSpsArquitecturaCached(
  sessionToken?: string | null,
): Promise<SpArquitectura[]> {
  const cacheKey = sessionToken?.slice(0, 24) || "default";
  const hit = cacheByToken.get(cacheKey);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.items;
  }

  const items = await fetchSpsArquitectura({ sessionToken });
  logArquitecturaLoaded(items);
  cacheByToken.set(cacheKey, {
    items,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return items;
}

export function getSpNombre(sp: SpArquitectura): string {
  return String(sp.nombre ?? sp.name ?? "").trim();
}

export function getSpDescripcion(sp: SpArquitectura): string {
  return String(sp.descripcion ?? sp.description ?? "").trim();
}

/** Solo parámetros de entrada (nunca OUTPUT). */
export function getSpParametros(sp: SpArquitectura): SpParametroArquitectura[] {
  return (sp.parametros ?? sp.parameters ?? []).filter((p) => !p.esOutput);
}

/** Texto compacto del catálogo para el System Prompt (sin SQL). */
export function formatArquitecturaForPrompt(
  catalog: SpArquitectura[],
  mode: PromptCatalogMode = "full",
): string {
  if (catalog.length === 0) {
    return "Catálogo de SPs vacío o no disponible. Usá solo SPs que empiecen con sp_ISG_Vision_.";
  }

  if (mode === "minimal") {
    const lines = catalog.map((sp) => `• ${getSpNombre(sp)}`);
    return [
      "Consultas candidatas (solo nombres; usá listarCatalogoPulso si necesitás parámetros):",
      ...lines,
    ].join("\n");
  }

  if (mode === "compact") {
    const lines = catalog.map((sp) => {
      const name = getSpNombre(sp);
      return `• ${name} — ${formatSpParamHint(sp)}`;
    });

    return [
      "Catálogo ERP (GET /SPs_arquitectura vía sys.parameters; sin código SQL):",
      ...lines,
    ].join("\n");
  }

  const lines = catalog.map((sp) => {
    const name = getSpNombre(sp);
    const desc = getSpDescripcion(sp);
    const params = getSpParametros(sp)
      .map((p) => {
        const pName = p.nombre;
        const pType = p.tipo ?? p.type ?? "unknown";
        const req = (p.requerido ?? p.required) !== false ? "requerido" : "opcional";
        return `  - ${pName} (${pType}, ${req})`;
      })
      .join("\n");

    return [
      `• ${name}${desc ? `\n  ${desc}` : ""}`,
      params ? `  Parámetros de entrada:\n${params}` : "  (sin parámetros de entrada)",
    ].join("\n");
  });

  return [
    "Catálogo de consultas ERP disponibles (sys.parameters):",
    ...lines,
  ].join("\n");
}
