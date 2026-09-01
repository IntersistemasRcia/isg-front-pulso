import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import { formatPulsoDateValue } from "@/lib/pulso/formatParams";
import { isDeniedSpParamName } from "@/lib/pulso/normalizeArquitectura";
import type { SpArquitectura, SpParametroArquitectura } from "@/lib/pulso/types";

/** Índice nombreSp → parámetros de entrada (sys.parameters vía SPs_arquitectura). */
export type SpCatalogIndex = Map<string, SpParametroArquitectura[]>;

export function buildSpCatalogIndex(catalog: SpArquitectura[]): SpCatalogIndex {
  const index: SpCatalogIndex = new Map();
  for (const sp of catalog) {
    index.set(getSpNombre(sp).toLowerCase(), getSpParametros(sp));
  }
  return index;
}

/** Firma ordenada de letras para matchear FechaDesde ↔ DesdeFecha. */
function paramSignature(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z]/g, "")
    .split("")
    .sort()
    .join("");
}

/**
 * Resuelve el nombre de parámetro del LLM al definido en SPs_arquitectura.
 * Fuente: sys.parameters en isg-api-pulso (GET /SPs_arquitectura).
 */
export function resolveParamNameForSp(
  nombreSp: string,
  llmKey: string,
  index: SpCatalogIndex,
): string | null {
  const stripped = llmKey.trim().replace(/^@/, "");
  if (!stripped) return null;

  const known = index.get(nombreSp.toLowerCase()) ?? [];
  if (known.length === 0) return stripped;

  const lower = stripped.toLowerCase();

  const exact = known.find((p) => p.nombre.toLowerCase() === lower);
  if (exact) return exact.nombre;

  const sig = paramSignature(stripped);
  const bySig = known.find((p) => paramSignature(p.nombre) === sig);
  if (bySig) return bySig.nombre;

  const partial = known.find((p) => {
    const kn = p.nombre.toLowerCase();
    return kn.includes(lower) || lower.includes(kn);
  });
  if (partial) return partial.nombre;

  return null;
}

export function isDateParam(param: SpParametroArquitectura): boolean {
  const tipo = (param.tipo ?? param.type ?? "").toLowerCase();
  if (/date|time/.test(tipo)) return true;
  return /fecha|date|desde|hasta|periodo/i.test(param.nombre);
}

export type CoerceParamsResult = {
  parametros: Record<string, unknown>;
  warnings: string[];
};

/**
 * Alinea parámetros del LLM al catálogo SPs_arquitectura antes de POST /ejecutar-sp.
 */
export function coerceParamsForSp(
  nombreSp: string,
  raw: Record<string, unknown>,
  catalog: SpArquitectura[],
): CoerceParamsResult {
  const index = buildSpCatalogIndex(catalog);
  const known = index.get(nombreSp.toLowerCase()) ?? [];
  const knownByName = new Map(known.map((p) => [p.nombre.toLowerCase(), p]));
  const result: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (isDeniedSpParamName(key)) {
      warnings.push(
        `Parámetro "${key}" es variable de cuerpo SQL (no es input del SP); omitido.`,
      );
      continue;
    }

    const resolved = resolveParamNameForSp(nombreSp, key, index);

    if (!resolved) {
      warnings.push(`Parámetro "${key}" vacío o inválido; omitido.`);
      continue;
    }

    if (known.length > 0 && !knownByName.has(resolved.toLowerCase())) {
      warnings.push(
        `Parámetro "${key}" no existe en SPs_arquitectura para ${nombreSp}; omitido.`,
      );
      continue;
    }

    const meta = knownByName.get(resolved.toLowerCase());
    result[resolved] =
      meta && isDateParam(meta) ? formatPulsoDateValue(value) : value;
  }

  if (known.length > 0) {
    const resultKeysLower = new Set(
      Object.keys(result).map((k) => k.toLowerCase()),
    );
    for (const p of known) {
      // OUTPUT / variables del cuerpo ya no entran al catálogo; solo falta de inputs reales.
      if (
        (p.requerido ?? p.required) !== false &&
        !resultKeysLower.has(p.nombre.toLowerCase())
      ) {
        warnings.push(
          `Falta parámetro de entrada "${p.nombre}" (firma del SP en SPs_arquitectura).`,
        );
      }
    }
  }

  return { parametros: result, warnings };
}

export function formatSpParamHint(sp: SpArquitectura): string {
  const params = getSpParametros(sp)
    .map((p) => {
      const tipo = p.tipo ?? p.type;
      const dateHint = tipo && /date|time/i.test(tipo) ? " (dd/MM/yyyy)" : "";
      return `${p.nombre}${dateHint}`;
    })
    .join(", ");
  return params || "(sin parámetros)";
}
