/**
 * Políticas de intención → parámetro.
 *
 * Problema: params opcionales con default SQL “peligroso” (cambia el resultado
 * si el LLM los omite o manda el default). Ej. TipoRanking=IMPORTE, Objetivo=80.
 *
 * Solución estándar (no partir el SP por cada valor de enum):
 * 1. Metadatos Pulso en el SP documentan literales/defaults/efecto.
 * 2. Prompt refuerza la interpretación.
 * 3. Este registro FORCEA el valor en runtime según el texto del usuario.
 *
 * Para un SP/param nuevo: agregar una `ParamIntentRule` abajo (o varias).
 * No hardcodear coerción suelta en tools.ts.
 */

export type ParamIntentResolveContext = {
  userText: string;
  nombreSp: string;
  params: Record<string, unknown>;
};

export type ParamIntentRule = {
  /** Id estable para logs / smoke. */
  id: string;
  /** SP al que aplica (nombre técnico). */
  spName: RegExp;
  /**
   * Nombre canónico del param en la firma (sin @).
   * Se busca case-insensitive en params ya coerceados.
   */
  paramKey: string;
  /**
   * Si el texto user matchea, se aplica `resolve`.
   * Si es null, la regla siempre corre para ese SP (útil para cerrar rangos).
   */
  whenUser: RegExp | null;
  /**
   * Prioridad: mayor gana si varias reglas tocan el mismo paramKey.
   * Default 0.
   */
  priority?: number;
  /** Valor a forzar (o null = no tocar). */
  resolve: (ctx: ParamIntentResolveContext) => unknown | null | undefined;
};

function normalizeUserText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findParamKey(
  params: Record<string, unknown>,
  want: string,
): string | undefined {
  const lower = want.toLowerCase();
  return Object.keys(params).find((k) => k.toLowerCase() === lower);
}

function setParam(
  params: Record<string, unknown>,
  paramKey: string,
  value: unknown,
): void {
  const existing = findParamKey(params, paramKey);
  if (existing) {
    params[existing] = value;
  } else {
    params[paramKey] = value;
  }
}

function getParam(
  params: Record<string, unknown>,
  paramKey: string,
): unknown {
  const key = findParamKey(params, paramKey);
  return key != null ? params[key] : undefined;
}

/** Cierra Desde sin Hasta (y viceversa) para filtros de maestro en ranking. */
export function closeOpenRangeParams(
  params: Record<string, unknown>,
  pairs: Array<{ desde: string; hasta: string }>,
): Record<string, unknown> {
  const next = { ...params };
  for (const { desde, hasta } of pairs) {
    const d = getParam(next, desde);
    const h = getParam(next, hasta);
    const dOk = d != null && d !== "";
    const hOk = h != null && h !== "";
    if (dOk && !hOk) setParam(next, hasta, d);
    else if (hOk && !dOk) setParam(next, desde, h);
  }
  return next;
}

const RANGE_PAIRS = [
  { desde: "RubroDesde", hasta: "RubroHasta" },
  { desde: "SubrubroDesde", hasta: "SubrubroHasta" },
  { desde: "MarcaDesde", hasta: "MarcaHasta" },
] as const;

const RANKING_VENTAS_SP = /rankingventas_por_articulo/i;

const wantsCantidadRanking =
  /ordenad[oa]s?\s+por\s+cantidad|por\s+cantidad(?:\s+de\s+articulos?)?|cantidad\s+de\s+articulos?\s+vendid|ranking\s+por\s+cantidad|\bcantidad\b.*\b(orden|rank|mayor|menor)/i;

const wantsImporteRanking =
  /ordenad[oa]s?\s+por\s+importe|por\s+importe|por\s+monto|por\s+venta(?:s)?\s+(en\s+)?(pesos|plata|\$)|ranking\s+por\s+importe/i;

const wantsExplicitPareto =
  /\b(?:top|objetivo|concentran|pareto)\b|\b\d{1,3}\s*%|\bobjetivo\s*venta/i;

function extractObjetivoPct(userText: string): number | null {
  const t = normalizeUserText(userText);
  const m =
    t.match(/\b(?:top|objetivo(?:\s+venta)?(?:\s*pct)?|concentran(?:\s+el)?)\s*(\d{1,3})\s*%?/) ??
    t.match(/\b(\d{1,3})\s*%\s*(?:de\s+)?(?:las\s+)?ventas?\b/) ??
    t.match(/\b(?:primeros?|top)\s+(\d{1,3})\s*%/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Registro extensible. Agregar reglas acá para nuevos SPs/params peligrosos.
 * Documentación: docs/PULSO_SP_METADATA.md § ParamIntentPolicy.
 */
export const PARAM_INTENT_RULES: readonly ParamIntentRule[] = [
  {
    id: "ranking-tipo-cantidad",
    spName: RANKING_VENTAS_SP,
    paramKey: "TipoRanking",
    whenUser: wantsCantidadRanking,
    priority: 20,
    resolve: () => "CANTIDAD",
  },
  {
    id: "ranking-tipo-importe",
    spName: RANKING_VENTAS_SP,
    paramKey: "TipoRanking",
    whenUser: wantsImporteRanking,
    priority: 20,
    resolve: () => "IMPORTE",
  },
  {
    id: "ranking-objetivo-explicito",
    spName: RANKING_VENTAS_SP,
    paramKey: "ObjetivoVentaPct",
    whenUser: wantsExplicitPareto,
    priority: 30,
    resolve: ({ userText }) => extractObjetivoPct(userText),
  },
  {
    id: "ranking-objetivo-completo",
    spName: RANKING_VENTAS_SP,
    paramKey: "ObjetivoVentaPct",
    // Listado/ranking sin top/% → universo completo (no default SQL 80).
    whenUser: /ranking|listado|mostrame|mostrar|informe|articulos?\s+vendid/i,
    priority: 10,
    resolve: ({ userText }) => {
      if (wantsExplicitPareto.test(normalizeUserText(userText))) return null;
      if (extractObjetivoPct(userText) != null) return null;
      return 100;
    },
  },
];

export type ParamIntentApplyResult = {
  params: Record<string, unknown>;
  /** Overrides aplicados (id → valor). */
  applied: Array<{ id: string; paramKey: string; value: unknown }>;
};

/**
 * Aplica reglas del registro + cierre de rangos Desde/Hasta.
 * Idempotente; no muta el objeto de entrada.
 */
export function applyParamIntentOverrides(options: {
  nombreSp: string;
  userText: string | undefined;
  params: Record<string, unknown>;
  rules?: readonly ParamIntentRule[];
}): ParamIntentApplyResult {
  const { nombreSp, params } = options;
  const userText = options.userText?.trim() ?? "";
  const rules = options.rules ?? PARAM_INTENT_RULES;
  let next = { ...params };
  const applied: ParamIntentApplyResult["applied"] = [];

  if (!userText) {
    next = closeOpenRangeParams(next, [...RANGE_PAIRS]);
    return { params: next, applied };
  }

  const matching = rules
    .filter((r) => r.spName.test(nombreSp))
    .filter((r) => r.whenUser == null || r.whenUser.test(userText))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  /** Un solo ganador por paramKey (mayor priority). */
  const winnerByKey = new Map<string, ParamIntentRule>();
  for (const rule of matching) {
    const key = rule.paramKey.toLowerCase();
    if (!winnerByKey.has(key)) winnerByKey.set(key, rule);
  }

  const ctx: ParamIntentResolveContext = {
    userText,
    nombreSp,
    params: next,
  };

  for (const rule of winnerByKey.values()) {
    const value = rule.resolve(ctx);
    if (value === null || value === undefined) continue;
    setParam(next, rule.paramKey, value);
    applied.push({ id: rule.id, paramKey: rule.paramKey, value });
  }

  next = closeOpenRangeParams(next, [...RANGE_PAIRS]);
  return { params: next, applied };
}
