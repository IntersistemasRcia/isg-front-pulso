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
    /** Incluye SubrubroDesde/Hasta de ranking. */
    paramKeys: /^(id)?sub[\s_]?rubro(desde|hasta)?$/i,
    idColumns: /^id[\s_]?sub[\s_]?rubro$/i,
    labelColumns: /^sub[\s_]?rubro$/i,
    spNameTokens: /subrubro/i,
  },
  {
    id: "rubro",
    nameTokens: /\brubros?\b/i,
    /** Incluye RubroDesde/Hasta de ranking. */
    paramKeys: /^(id|codigo)?rubro(desde|hasta)?$/i,
    idColumns: /^id[\s_]?rubro$/i,
    /** Informes: Rubro; Catalogo_*: Descripcion. */
    labelColumns: /^(rubro|descripcion)$/i,
    spNameTokens: /rubro/i,
  },
  {
    id: "marca",
    nameTokens: /\bmarcas?\b/i,
    paramKeys: /^(id)?marca(desde|hasta)?$/i,
    idColumns: /^id[\s_]?marca$/i,
    labelColumns: /^(marca|descripcion)$/i,
    spNameTokens: /marca/i,
  },
  {
    id: "sector",
    nameTokens: /\bsectores?\b|\bsector\b/i,
    paramKeys: /^(id)?sector(desde|hasta)?$/i,
    idColumns: /^id[\s_]?sector$/i,
    labelColumns: /^(sector|descripcion)$/i,
    spNameTokens: /sector/i,
  },
  {
    id: "sucursal",
    nameTokens: /\bsucursales?\b|\bsucursal\b/i,
    paramKeys: /^(id|codigo)?sucursal(desde|hasta)?$/i,
    idColumns: /^id[\s_]?sucursal$/i,
    labelColumns: /^(sucursal|descripcion)$/i,
    spNameTokens: /sucursal/i,
  },
  {
    id: "zona",
    nameTokens: /\bzonas?\b/i,
    paramKeys: /^(id)?zona(desde|hasta)?$/i,
    idColumns: /^id[\s_]?zona$/i,
    labelColumns: /^(zona|descripcion)$/i,
    spNameTokens: /zona/i,
  },
  {
    id: "vendedor",
    nameTokens: /\bvendedores?\b|\bvendedor\b/i,
    paramKeys: /^(id)?vendedor(desde|hasta)?$/i,
    idColumns: /^id[\s_]?vendedor$/i,
    labelColumns: /^(vendedor|descripcion)$/i,
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

const NAME_WORD = `[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9./\\-]*`;

const NAME_STOP =
  "en|del|de|para|por|con|y|o|el|la|los|las|un|una";

/** Limpia capturas basura tipo «quesos es 2101 no» / «Fiambres del». */
function cleanNameHint(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  // Cortar ante «es 2101», «es» suelto, «no el …», códigos
  s = s.split(/\s+es\b/i)[0] ?? s;
  s = s.split(/\s+no\s+el\b/i)[0] ?? s;
  s = s.split(/\s+(?:codigo|código)\b/i)[0] ?? s;
  s = s.replace(/\s+\d{2,}.*$/u, "").trim();
  s =
    s
      .split(new RegExp(`\\s+(?:${NAME_STOP})\\s+`, "i"))[0]
      ?.trim() ?? s;
  // «Fiambres del» (stop al final, sin token siguiente)
  s = s.replace(new RegExp(`\\s+(?:${NAME_STOP})$`, "i"), "").trim();
  if (!s || /^\d+$/.test(s) || s.length < 2) return undefined;
  return s;
}

type IntentHit = MasterIntent & { index: number };

/**
 * Extrae intenciones de maestro del texto del usuario (turno / contexto).
 * Código explícito: «rubro 2103», «IDRubro 2101», «código de sucursal 1».
 * Nombre: «rubro Fiambres», «de la sucursal Resistencia».
 * Si hay varios en el mismo texto, gana el último por dimensión.
 */
export function extractMasterIntents(userText: string): MasterIntent[] {
  const text = userText.trim();
  if (!text) return [];

  const hits: IntentHit[] = [];

  for (const dim of MASTER_DIMENSIONS) {
    const idAlt = `${dim.id}|${dim.id}s`;

    // Códigos: varias formas; matchAll para quedarnos con el último
    const codePatterns = [
      // «código de rubro quesos es 2101» / «codigo de rubro 2103»
      new RegExp(
        `(?:codigo|código)\\s+(?:de\\s+)?(?:${idAlt})\\b[^0-9]{0,48}?(\\d{1,12})`,
        "gi",
      ),
      // «rubro codigo 2103» / «rubro código: 2101»
      new RegExp(
        `\\b(?:${idAlt})\\s+(?:codigo|código)\\s*[:=]?\\s*(\\d{1,12})`,
        "gi",
      ),
      // «IDRubro 2101» / «rubro: 2103» / «rubro 2103»
      new RegExp(
        `(?:id\\s*)?(?:${idAlt})\\s*[:=]\\s*(\\d{1,12})`,
        "gi",
      ),
      new RegExp(`\\b(?:${idAlt})\\s+(\\d{1,12})\\b`, "gi"),
    ];

    for (const re of codePatterns) {
      for (const m of text.matchAll(re)) {
        if (!m[1] || m.index == null) continue;
        hits.push({ dimension: dim, code: m[1], index: m.index });
      }
    }

    if (!dim.nameTokens.test(text)) continue;

    // Nombres: «rubro: quesos», «del rubro Fiambres», «rubro QUESOS»
    const namePatterns = [
      new RegExp(
        `\\b(?:${idAlt})\\s*[:=]\\s*["“']?(${NAME_WORD}(?:\\s+${NAME_WORD}){0,4})`,
        "gi",
      ),
      new RegExp(
        `(?:del?\\s+)?(?:${idAlt})\\s+(?:de\\s+|del\\s+)?["“']?(${NAME_WORD}(?:\\s+${NAME_WORD}){0,4})`,
        "gi",
      ),
    ];

    for (const re of namePatterns) {
      for (const m of text.matchAll(re)) {
        if (m.index == null) continue;
        const nameHint = cleanNameHint(m[1]);
        if (!nameHint) continue;
        // Evitar capturar «codigo» / «código» como nombre
        if (/^(codigo|código|id)$/i.test(nameHint)) continue;
        hits.push({ dimension: dim, nameHint, index: m.index });
      }
    }

    // Mención de dimensión sin valor (solo si no hubo hits de esta dim)
    if (!hits.some((h) => h.dimension.id === dim.id)) {
      const bare = text.match(dim.nameTokens);
      if (bare?.index != null) {
        hits.push({ dimension: dim, index: bare.index });
      }
    }
  }

  // Orden de aparición; último por dimensión gana (merge code + nameHint)
  hits.sort((a, b) => a.index - b.index);
  const byDim = new Map<string, MasterIntent>();
  for (const hit of hits) {
    const prev = byDim.get(hit.dimension.id);
    byDim.set(hit.dimension.id, {
      dimension: hit.dimension,
      code: hit.code ?? prev?.code,
      nameHint: hit.nameHint ?? prev?.nameHint,
    });
  }

  return [...byDim.values()];
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
  code: "MASTER_MISMATCH";
  dimension: string;
  expectedCode?: string;
  expectedName?: string;
  sampleIds: string[];
  sampleLabels: string[];
  avisoUsuario: string;
};

/**
 * Contrasta el pedido del usuario (y params enviados) con columnas de dimensión en preview.
 * Si hay desacuerdo (nombre pedido vs etiqueta de filas, o código pedido vs IDs de filas),
 * devuelve mismatch duro (ok:false vía appendMasterMismatchHint).
 * No aplica a listados Catalogo_* / Get* maestros (ahí se usa resolveMasterFromCatalogRows).
 */
export function detectMasterMismatch(options: {
  userText: string;
  parametros: Record<string, unknown>;
  previewRows: unknown[];
  nombreSp?: string;
}): MasterMismatch | null {
  const { userText, parametros, previewRows, nombreSp } = options;
  if (!previewRows.length) return null;
  if (
    nombreSp &&
    (isMasterListSpName(nombreSp) || looksLikeMasterListSp(nombreSp))
  ) {
    return null;
  }

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
          code: "MASTER_MISMATCH",
          dimension: dim.id,
          expectedCode: want,
          sampleIds: distinct.slice(0, 5),
          sampleLabels,
          avisoUsuario: [
            `MASTER_MISMATCH: pediste ${dim.id} código ${want}, pero las filas son de otro/s (${distinct.slice(0, 3).join(", ")}${sampleLabels.length ? ` / ${sampleLabels.join(", ")}` : ""}).`,
            "Este resultado NO es válido. NO lo presentes al usuario. Ejecutá Catalogo_* del maestro, tomá el CÓDIGO correcto y reejecutá el informe. PROHIBIDO reusar un código viejo del hilo. Al usuario decí «código», nunca «ID».",
          ].join(" "),
        };
      }
    }

    // Nombre pedido vs etiquetas de filas (ej. Fiambres vs QUESOS)
    if (nameHint && labels.length) {
      // Si el código enviado en params calza con los IDs de fila, el filtro es
      // coherente aunque un nameHint viejo del contexto no coincida.
      const paramCodeEntry = Object.entries(parametros).find(([k]) =>
        dim.paramKeys.test(k.replace(/\s+/g, "")),
      );
      if (
        paramCodeEntry &&
        isNumericCode(paramCodeEntry[1]) &&
        ids.length
      ) {
        const wantParam = String(paramCodeEntry[1]).trim();
        const idSet = new Set(ids.map((v) => String(v).trim()).filter(Boolean));
        if (idSet.has(wantParam)) {
          continue;
        }
      }

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
          code: "MASTER_MISMATCH",
          dimension: dim.id,
          expectedName: nameHint,
          sampleIds,
          sampleLabels,
          avisoUsuario: [
            `MASTER_MISMATCH: pediste ${dim.id} «${nameHint}», pero las filas muestran «${sampleLabels.join(", ") || "otro valor"}».`,
            "Este resultado NO es válido. NO lo presentes al usuario ni digas que es el maestro pedido.",
            "Ejecutá YA Catalogo_* del catálogo, buscá el nombre exacto, usá ese CÓDIGO en el informe y reejecutá. PROHIBIDO reusar un código viejo del hilo. PROHIBIDO pedir confirmación si hay match exacto. Al usuario decí «código», nunca «ID».",
          ].join(" "),
        };
      }
    }
  }

  return null;
}

export type MaestroResuelto = {
  dimension: string;
  nombre: string;
  codigo: string;
  exacto: boolean;
};

/**
 * Tras Catalogo_* / Get* maestro: si el usuario pidió un nombre, resuelve el código.
 * Match exacto (normalizado) preferido; si no, includes.
 */
export function resolveMasterFromCatalogRows(options: {
  userText: string;
  nombreSp: string;
  rows: unknown[];
}): MaestroResuelto | null {
  const { userText, nombreSp, rows } = options;
  if (!rows.length || !userText.trim()) return null;
  if (!isMasterListSpName(nombreSp) && !looksLikeMasterListSp(nombreSp)) {
    return null;
  }

  const dim =
    inferMasterDimensionFromSpName(nombreSp) ??
    extractMasterIntents(userText)[0]?.dimension;
  if (!dim) return null;

  const intents = extractMasterIntents(userText).filter(
    (i) => i.dimension.id === dim.id && i.nameHint,
  );
  const nameHint =
    intents[0]?.nameHint ??
    extractMasterIntents(userText).find((i) => i.nameHint)?.nameHint;
  if (!nameHint) return null;

  const wantNorm = normalizeLabel(nameHint);
  if (wantNorm.length < 2) return null;

  type Cand = { codigo: string; nombre: string; exacto: boolean };
  const cands: Cand[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    let idVal: unknown;
    let labelVal: unknown;
    for (const [k, v] of Object.entries(rec)) {
      if (dim.idColumns.test(k.replace(/\s+/g, ""))) idVal = v;
      if (dim.labelColumns.test(k.replace(/\s+/g, ""))) labelVal = v;
    }
    if (idVal == null || labelVal == null) continue;
    const labNorm = normalizeLabel(labelVal);
    if (!labNorm) continue;
    if (labNorm === wantNorm) {
      cands.push({
        codigo: String(idVal).trim(),
        nombre: String(labelVal).trim(),
        exacto: true,
      });
    } else if (labNorm.includes(wantNorm) || wantNorm.includes(labNorm)) {
      cands.push({
        codigo: String(idVal).trim(),
        nombre: String(labelVal).trim(),
        exacto: false,
      });
    }
  }

  const exact = cands.find((c) => c.exacto);
  const pick = exact ?? cands[0];
  if (!pick) return null;

  return {
    dimension: dim.id,
    nombre: pick.nombre,
    codigo: pick.codigo,
    exacto: pick.exacto,
  };
}

/**
 * Hard gate: mismatch → ok:false (el modelo no puede presentar filas erróneas).
 * No deja uiTable/rows en el payload de éxito.
 */
export function appendMasterMismatchHint(
  payload: Record<string, unknown>,
  mismatch: MasterMismatch | null,
): Record<string, unknown> {
  if (!mismatch) return payload;
  return {
    ok: false,
    code: "MASTER_MISMATCH",
    nombreSp: payload.nombreSp,
    masterMismatch: {
      dimension: mismatch.dimension,
      expectedCode: mismatch.expectedCode,
      expectedName: mismatch.expectedName,
      sampleIds: mismatch.sampleIds,
      sampleLabels: mismatch.sampleLabels,
    },
    avisoUsuario: mismatch.avisoUsuario,
  };
}

/** Inyecta maestroResuelto + aviso obligatorio tras Catalogo_* con match. */
export function appendMaestroResueltoHint(
  payload: Record<string, unknown>,
  resolved: MaestroResuelto | null,
): Record<string, unknown> {
  if (!resolved || payload.ok !== true) return payload;
  const prev =
    typeof payload.avisoUsuario === "string" ? payload.avisoUsuario.trim() : "";
  const instruccion = resolved.exacto
    ? [
        `maestroResuelto: ${resolved.dimension} «${resolved.nombre}» → CÓDIGO ${resolved.codigo} (match exacto).`,
        `Usá YA el código ${resolved.codigo} en el informe pedido y reejecutá. PROHIBIDO pedir confirmación al usuario. PROHIBIDO reusar otro código del hilo. Al usuario decí «código ${resolved.codigo}» o el nombre «${resolved.nombre}», nunca «ID».`,
      ].join(" ")
    : [
        `maestroResuelto (parcial): ${resolved.dimension} «${resolved.nombre}» → CÓDIGO ${resolved.codigo}.`,
        `Si el nombre calza con lo pedido, usá el código ${resolved.codigo} y reejecutá el informe. Si hay varias opciones cercanas, ofrecé 1–2 nombres de negocio (sin decir ID). Al usuario decí «código», nunca «ID».`,
      ].join(" ");

  return {
    ...payload,
    code: "MAESTRO_RESUELTO",
    maestroResuelto: resolved,
    avisoUsuario: [prev, instruccion].filter(Boolean).join(" "),
  };
}

/**
 * ¿El usuario pidió ver el catálogo/maestro en sí, o un informe de negocio?
 * Si pide ventas/reposición/etc., Catalogo_* es resolución interna (sin UI).
 */
export function userAskedForMasterCatalogList(userText: string): boolean {
  const t = userText.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const wantsReport =
    /\b(venta|ventas|informe|reposicion|reponer|stock|margen|ranking|cuanto|comprar|kpi|evolucion|factur)\w*/.test(
      t,
    );
  if (wantsReport) return false;
  return /\b(catalogo|listado|lista|dame|mostrame|mostrar|cuales|que)\b/.test(t) &&
    /\b(rubro|rubros|marca|marcas|subrubro|sucursal|sucursales|sector|vendedor)\b/.test(
      t,
    );
}

/**
 * SP Catalogo_ o Get* usado para resolver código: sin tabla ni Excel al usuario.
 * El modelo sigue viendo filas (via toModelOutput) y maestroResuelto.
 */
export function makeMasterLookupSilent(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (payload.ok !== true) return payload;
  const prev =
    typeof payload.avisoUsuario === "string" ? payload.avisoUsuario.trim() : "";
  const next: Record<string, unknown> = {
    ...payload,
    uiTable: false,
    uiSilent: true,
    avisoUsuario: [
      prev,
      "Resolución de maestro (uso interno): NO hay tabla ni Excel en pantalla.",
      "NO presentes este listado al usuario. NO digas que hay un Excel del catálogo.",
      "Si hay maestroResuelto: ejecutá YA UNA sola vez el informe de negocio con ese código.",
      "PROHIBIDO volver a llamar este catálogo en el mismo turno. PROHIBIDO apilar varios listados.",
    ]
      .filter(Boolean)
      .join(" "),
  };
  delete next.delivery;
  delete next.exportId;
  return next;
}

export type OmittedMasterFilter = {
  dimension: string;
  attemptedKey: string;
  attemptedValue: unknown;
};

function paramKeyMatchesDimension(key: string, dim: MasterDimension): boolean {
  const stripped = key.replace(/^@/, "").trim();
  if (dim.paramKeys.test(stripped)) return true;
  // CodigoRubro / ID_Rubro / RubroDesde → normalizar letras
  const compact = stripped.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = dim.id.toLowerCase();
  return (
    compact === id ||
    compact === `id${id}` ||
    compact === `codigo${id}` ||
    compact === `${id}desde` ||
    compact === `${id}hasta` ||
    compact === `id${id}desde` ||
    compact === `id${id}hasta`
  );
}

/**
 * Filtro de maestro pedido (nombre/código) que el LLM envió pero coerce omitió
 * (nombre no está en la firma del SP). Evita devolver ranking sin filtrar.
 */
export function detectOmittedMasterFilters(options: {
  userText: string | undefined;
  rawParams: Record<string, unknown>;
  coercedParams: Record<string, unknown>;
}): OmittedMasterFilter[] {
  const { userText, rawParams, coercedParams } = options;
  if (!userText?.trim()) return [];

  const intents = extractMasterIntents(userText).filter(
    (i) => Boolean(i.code || i.nameHint),
  );
  if (!intents.length) return [];

  const coercedKeys = Object.keys(coercedParams);
  const out: OmittedMasterFilter[] = [];

  for (const intent of intents) {
    const dim = intent.dimension;
    const stillPresent = coercedKeys.some((k) => paramKeyMatchesDimension(k, dim));
    if (stillPresent) continue;

    for (const [key, value] of Object.entries(rawParams)) {
      if (value == null || (typeof value === "string" && value.trim() === "")) {
        continue;
      }
      if (!paramKeyMatchesDimension(key, dim)) continue;
      out.push({
        dimension: dim.id,
        attemptedKey: key,
        attemptedValue: value,
      });
      break;
    }
  }

  return out;
}
