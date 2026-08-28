import { fetchSpsArquitectura } from "@/lib/pulso/client";
import type { SpArquitectura, SpParametroArquitectura } from "@/lib/pulso/types";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  items: SpArquitectura[];
};

const cacheByToken = new Map<string, CacheEntry>();

/**
 * Obtiene el catálogo de SPs con cache en memoria (5 min).
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

export function getSpParametros(sp: SpArquitectura): SpParametroArquitectura[] {
  return sp.parametros ?? sp.parameters ?? [];
}

/** Texto compacto del catálogo para enriquecer el System Prompt. */
export function formatArquitecturaForPrompt(catalog: SpArquitectura[]): string {
  if (catalog.length === 0) {
    return "Catálogo de SPs vacío o no disponible. Usá solo SPs que empiecen con sp_ISG_Vision_.";
  }

  const lines = catalog.map((sp) => {
    const name = getSpNombre(sp);
    const desc = getSpDescripcion(sp);
    const params = getSpParametros(sp)
      .map((p) => {
        const pName = p.nombre;
        const pType = p.tipo ?? p.type ?? "unknown";
        const req = p.requerido ?? p.required ? "requerido" : "opcional";
        const pDesc = p.descripcion ?? p.description ?? "";
        return `  - ${pName} (${pType}, ${req})${pDesc ? `: ${pDesc}` : ""}`;
      })
      .join("\n");

    return [
      `• ${name}${desc ? ` — ${desc}` : ""}`,
      params || "  (sin parámetros documentados)",
    ].join("\n");
  });

  return [
    "Catálogo de arquitectura de Stored Procedures disponibles:",
    ...lines,
  ].join("\n");
}
