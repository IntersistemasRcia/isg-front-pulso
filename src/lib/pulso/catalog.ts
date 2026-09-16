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

/** Tope de descripción Pulso en prompt (alineado al parser API, max 1000). */
export const PULSO_DESC_PROMPT_MAX = 1000;

function clipPulsoDesc(desc: string, max: number): string {
  const t = desc.trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
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
    const lines = catalog.map((sp) => {
      const name = getSpNombre(sp);
      const short = clipPulsoDesc(getSpDescripcion(sp), 400);
      return short ? `• ${name} — ${short}` : `• ${name}`;
    });
    return [
      "Consultas ERP candidatas (USO INTERNO — elegí una vos usando nombre y descripción; no preguntes al usuario cuál usar):",
      ...lines,
    ].join("\n");
  }

  if (mode === "compact") {
    const lines = catalog.map((sp) => {
      const name = getSpNombre(sp);
      const short = clipPulsoDesc(getSpDescripcion(sp), 700);
      const params = formatSpParamHint(sp);
      return short
        ? `• ${name} — ${short} — ${params}`
        : `• ${name} — ${params}`;
    });

    return [
      "Consultas ERP candidatas (USO INTERNO — elegí la adecuada por descripción e intención; ejecutá; no menciones estos nombres al usuario):",
      ...lines,
    ].join("\n");
  }

  const lines = catalog.map((sp) => {
    const name = getSpNombre(sp);
    const desc = clipPulsoDesc(getSpDescripcion(sp), PULSO_DESC_PROMPT_MAX);
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

/**
 * Hint interno: 1–3 consultas más cercanas al ranking, en lenguaje de negocio
 * (para ofrecer alternativas cuando no hay match exacto).
 */
export function formatClosestAlternativesHint(
  rankedCatalog: SpArquitectura[],
  limit = 3,
): string | undefined {
  if (rankedCatalog.length === 0) return undefined;

  const lines = rankedCatalog.slice(0, limit).map((sp, index) => {
    const name = getSpNombre(sp);
    const desc = getSpDescripcion(sp);
    const params = formatSpParamHint(sp);
    const business =
      clipPulsoDesc(desc, 280) ||
      name.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ");
    return `${index + 1}) ${business} [interno: ${name}; params: ${params}]`;
  });

  return [
    "## Alternativas cercanas a la consulta del usuario (USO INTERNO)",
    "Si no hay una consulta que cubra exactamente el pedido, NO inventes errores de acceso ni digas que no se pudo obtener la información.",
    "Ofrecé al usuario 1 o 2 de estas opciones en lenguaje de negocio (sin nombrar el SP técnico), pedí el dato faltante si hace falta, y ejecutá la que elija o la más cercana si ya tiene params.",
    ...lines,
  ].join("\n");
}
