/**
 * Política extensible de maestros (rubro, subrubro, marca, sector, sucursal, …):
 * detección de intención, alternativas Catalogo_* ante Get* fantasma, mismatch post-tool.
 */

import { getSpDescripcion, getSpNombre } from "@/lib/pulso/catalog";
import {
  isMasterListSpName,
  isTipoCatalogo,
  parsePulsoMetadata,
} from "@/lib/pulso/parsePulsoMetadata";
import { selectRelevantSps } from "@/lib/pulso/selectRelevantSps";
import type { SpArquitectura } from "@/lib/pulso/types";

/** Dimensión maestra: params / columnas típicas del ERP. Extensible sin nuevo flujo. */
export type MasterDimension = {
  id: string;
  /** Tokens de negocio en el pedido del usuario. */
  nameTokens: RegExp;
  /** Params de tool que suelen llevar el ID/código. */
  paramKeys: RegExp;
  /** Columnas de ID en filas. */
  idColumns: RegExp;
  /** Columnas de etiqueta en filas. */
  labelColumns: RegExp;
  /** Fragmentos en nombre de SP (Catalogo_Rubros, GetMarcas, …). */
  spNameTokens: RegExp;
};

export const MASTER_DIMENSIONS: readonly MasterDimension[] = [
  {
    id: "subrubro",
    nameTokens: /\bsub[\s_-]?rubros?\b/i,
    paramKeys: /^(id)?sub[\s_]?rubro$/i,
    idColumns: /^id[\s_]?sub[\s_]?rubro$/i,
    labelColumns: /^sub[\s_]?rubro$/i,
    spNameTokens: /subrubro/i,
  },
  {
    id: "rubro",
    nameTokens: /\brubros?\b/i,
    paramKeys: /^(id)?rubro$/i,
    idColumns: /^id[\s_]?rubro$/i,
    labelColumns: /^rubro$/i,
    spNameTokens: /rubro/i,
  },
  {
    id: "marca",
    nameTokens: /\bmarcas?\b/i,
    paramKeys: /^(id)?marca$/i,
    idColumns: /^id[\s_]?marca$/i,
    labelColumns: /^marca$/i,
    spNameTokens: /marca/i,
  },
  {
    id: "sector",
    nameTokens: /\bsectores?\b|\bsector\b/i,
    paramKeys: /^(id)?sector$/i,
    idColumns: /^id[\s_]?sector$/i,
    labelColumns: /^sector$/i,
    spNameTokens: /sector/i,
  },
  {
    id: "sucursal",
    nameTokens: /\bsucursales?\b|\bsucursal\b/i,
    paramKeys: /^(id)?sucursal$/i,
    idColumns: /^id[\s_]?sucursal$/i,
    labelColumns: /^sucursal$/i,
    spNameTokens: /sucursal/i,
  },
  {
    id: "zona",
    nameTokens: /\bzonas?\b/i,
    paramKeys: /^(id)?zona$/i,
    idColumns: /^id[\s_]?zona$/i,
    labelColumns: /^zona$/i,
    spNameTokens: /zona/i,
  },
  {
    id: "vendedor",
    nameTokens: /\bvendedores?\b|\bvendedor\b/i,
    paramKeys: /^(id)?vendedor$/i,
    idColumns: /^id[\s_]?vendedor$/i,
    labelColumns: /^vendedor$/i,
    spNameTokens: /vendedor/i,
  },
] as const;

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isNumericCode(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return true;
  return false;
}

/** Entidad maestra sugerida por el nombre del SP (GetRubros → rubro). */
export function inferMasterDimensionFromSpName(
  nombreSp: string,
): MasterDimension | undefined {
  const n = nombreSp.toLowerCase();
  // subrubro antes que rubro
  for (const dim of MASTER_DIMENSIONS) {
    if (dim.spNameTokens.test(n)) return dim;
  }
  return undefined;
}

/**
 * ¿El SP desconocido parece un listado maestro (Get* / Catalogo_*)?
 * Usado para endurecer UNKNOWN_SP.
 */
export function looksLikeMasterListSp(nombreSp: string): boolean {
  if (isMasterListSpName(nombreSp)) return true;
  return /sp_isg_vision_get[a-z0-9_]+/i.test(nombreSp);
}

/**
 * Alternativas para UNKNOWN_SP de maestros: prioriza Catalogo_* / TIPO:CATALOGO
 * del mismo dominio; completa con ranking léxico.
 */
export function pickMasterCatalogAlternatives(
  nombreSp: string,
  catalog: SpArquitectura[],
  limit = 3,
): string[] {
  const dim = inferMasterDimensionFromSpName(nombreSp);
  const scored: Array<{ name: string; score: number }> = [];

  for (const sp of catalog) {
    const name = getSpNombre(sp);
    if (!name) continue;
    const nameLower = name.toLowerCase();
    const meta = parsePulsoMetadata(getSpDescripcion(sp));
    const catalogo = isTipoCatalogo(meta);
    const masterName = isMasterListSpName(name);
    if (!catalogo && !masterName) continue;

    let score = 0;
    if (catalogo) score += 10;
    if (/catalogo_/i.test(nameLower)) score += 6;
    if (masterName) score += 2;
    if (dim?.spNameTokens.test(nameLower)) {
      score += 20;
      // Preferir listado puro, no informes de margen por rubro
      if (/margen|venta|ranking|reposicion/i.test(nameLower)) score -= 8;
    }
    if (score > 0) scored.push({ name, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const preferred = scored.map((s) => s.name).slice(0, limit);

  if (preferred.length >= limit) return preferred;

  const fallback = selectRelevantSps(nombreSp, catalog, limit)
    .map((sp) => getSpNombre(sp))
    .filter((n) => n && !preferred.includes(n));

  return [...preferred, ...fallback].slice(0, limit);
}

export type MasterIntent = {
  dimension: MasterDimension;
  /** Código/ID explícito si el usuario lo escribió junto al maestro. */
  code?: string;
  /** Fragmento de nombre pedido (si no hay código). */
  nameHint?: string;
};

/**
 * Extrae intenciones de maestro del texto del usuario (turno / contexto).
 * Código explícito: «rubro 2103», «IDRubro 2101», «código de sucursal 1».
 * Nombre: «rubro Fiambres», «de la sucursal Resistencia».
 */
export function extractMasterIntents(userText: string): MasterIntent[] {
  const text = userText.trim();
  if (!text) return [];

  const intents: MasterIntent[] = [];

  for (const dim of MASTER_DIMENSIONS) {
    // «rubro 2103» / «IDRubro: 2101» / «código de rubro 2103»
    const codeMatch =
      text.match(
        new RegExp(
          `(?:id\\s*)?(?:${dim.id}|${dim.id}s)\\s*[:=]?\\s*(\\d+)`,
          "i",
        ),
      ) ||
      text.match(
        new RegExp(
          `(?:codigo|código)\\s*(?:de\\s*)?(?:${dim.id}|${dim.id}s)\\s*[:=]?\\s*(\\d+)`,
          "i",
        ),
      ) ||
      text.match(
        new RegExp(`\\b(?:${dim.id}|${dim.id}s)\\s+(\\d+)\\b`, "i"),
      );

    if (codeMatch?.[1]) {
      intents.push({ dimension: dim, code: codeMatch[1] });
      continue;
    }

    if (!dim.nameTokens.test(text)) continue;

    // «del rubro Fiambres» / «rubro Fiambres» / «artículos que sean del rubro Fiambres»
    const nameMatch = text.match(
      new RegExp(
        `(?:del?\\s+)?(?:${dim.id}|${dim.id}s)\\s+(?:de\\s+|del\\s+)?["“]?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\\s.\\-]{1,40})`,
        "i",
      ),
    );
    let nameHint = nameMatch?.[1]?.trim();
    if (nameHint) {
      // Cortar en preposiciones de cola típicas
      nameHint = nameHint
        .split(/\s+(?:en|del|de|para|por|con|y|o|el|la|los|las|un|una)\s+/i)[0]
        ?.trim();
    }
    if (nameHint && !/^\d+$/.test(nameHint) && nameHint.length >= 2) {
      intents.push({ dimension: dim, nameHint });
    } else if (dim.nameTokens.test(text)) {
      // Mención de la dimensión sin valor claro (ej. «buscá el rubro por nombre»)
      intents.push({ dimension: dim });
    }
  }

  return intents;
}

function findColumnKey(
  row: Record<string, unknown>,
  pattern: RegExp,
): string | undefined {
  return Object.keys(row).find((k) => pattern.test(k.replace(/\s+/g, "")));
}

function rowValues(
  rows: unknown[],
  pattern: RegExp,
  max = 12,
): unknown[] {
  const out: unknown[] = [];
  for (const raw of rows.slice(0, max)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const key = findColumnKey(row, pattern);
    if (!key) continue;
    out.push(row[key]);
  }
  return out;
}

export type MasterMismatch = {
  code: "MASTER_MISMATCH_HINT";
  dimension: string;
  expectedCode?: string;
  expectedName?: string;
  sampleIds: string[];
  sampleLabels: string[];
  avisoUsuario: string;
};

/**
 * Contrasta el pedido del usuario (y params enviados) con columnas de dimensión en preview.
 * Si hay desacuerdo (nombre pedido vs etiqueta de filas, o código pedido vs ID de filas),
 * devuelve hint para el modelo.
 */
export function detectMasterMismatch(options: {
  userText: string;
  parametros: Record<string, unknown>;
  previewRows: unknown[];
}): MasterMismatch | null {
  const { userText, parametros, previewRows } = options;
  if (!previewRows.length) return null;

  const intents = extractMasterIntents(userText);
  if (!intents.length) return null;

  for (const intent of intents) {
    const { dimension: dim, code, nameHint } = intent;
    const ids = rowValues(previewRows, dim.idColumns);
    const labels = rowValues(previewRows, dim.labelColumns);

    // Código pedido vs IDs de filas
    const expectedCode =
      code ??
      Object.entries(parametros).find(([k]) => dim.paramKeys.test(k.replace(/\s+/g, "")))?.[1];

    if (expectedCode != null && isNumericCode(expectedCode) && ids.length) {
      const want = String(expectedCode).trim();
      const distinct = [...new Set(ids.map((v) => String(v).trim()).filter(Boolean))];
      const allMatch = distinct.every((id) => id === want);
      if (!allMatch && distinct.length > 0) {
        const sampleLabels = [
          ...new Set(labels.map((l) => String(l).trim()).filter(Boolean)),
        ].slice(0, 3);
        return {
          code: "MASTER_MISMATCH_HINT",
          dimension: dim.id,
          expectedCode: want,
          sampleIds: distinct.slice(0, 5),
          sampleLabels,
          avisoUsuario: [
            `MASTER_MISMATCH_HINT: pediste ${dim.id} código ${want}, pero las filas muestran otro/s (${distinct.slice(0, 3).join(", ")}${sampleLabels.length ? ` / ${sampleLabels.join(", ")}` : ""}).`,
            "NO afirmes el maestro pedido. Resolvé de nuevo con Catalogo_* (o el Get* real del catálogo) y reejecutá el informe con el ID correcto.",
          ].join(" "),
        };
      }
    }

    // Nombre pedido vs etiquetas de filas (ej. Fiambres vs QUESOS)
    if (nameHint && labels.length) {
      const wantNorm = normalizeLabel(nameHint);
      if (wantNorm.length < 2) continue;
      const labelNorms = labels.map(normalizeLabel).filter(Boolean);
      const anyMatch = labelNorms.some(
        (lab) => lab.includes(wantNorm) || wantNorm.includes(lab),
      );
      if (!anyMatch) {
        const sampleLabels = [...new Set(labels.map((l) => String(l).trim()).filter(Boolean))].slice(
          0,
          3,
        );
        const sampleIds = [
          ...new Set(ids.map((v) => String(v).trim()).filter(Boolean)),
        ].slice(0, 5);
        return {
          code: "MASTER_MISMATCH_HINT",
          dimension: dim.id,
          expectedName: nameHint,
          sampleIds,
          sampleLabels,
          avisoUsuario: [
            `MASTER_MISMATCH_HINT: pediste ${dim.id} «${nameHint}», pero las filas muestran «${sampleLabels.join(", ") || "otro valor"}».`,
            "NO digas que es el maestro pedido. Ejecutá Catalogo_* del catálogo, tomá el ID correcto y reejecutá el informe. No reutilices un ID viejo del hilo.",
          ].join(" "),
        };
      }
    }
  }

  return null;
}

/** Anexa el hint de mismatch al avisoUsuario de un payload ok. */
export function appendMasterMismatchHint(
  payload: Record<string, unknown>,
  mismatch: MasterMismatch | null,
): Record<string, unknown> {
  if (!mismatch) return payload;
  const prev =
    typeof payload.avisoUsuario === "string" ? payload.avisoUsuario.trim() : "";
  return {
    ...payload,
    code: mismatch.code,
    masterMismatch: {
      dimension: mismatch.dimension,
      expectedCode: mismatch.expectedCode,
      expectedName: mismatch.expectedName,
      sampleIds: mismatch.sampleIds,
      sampleLabels: mismatch.sampleLabels,
    },
    avisoUsuario: [prev, mismatch.avisoUsuario].filter(Boolean).join(" "),
  };
}
