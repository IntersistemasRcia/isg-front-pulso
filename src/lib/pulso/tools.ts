import { tool } from "ai";
import { z } from "zod";
import { ejecutarSpPulso } from "@/lib/pulso/client";
import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import { selectRelevantSps } from "@/lib/pulso/selectRelevantSps";
import { formatSpParamHint } from "@/lib/pulso/spParamResolver";
import type { SpArquitectura } from "@/lib/pulso/types";
import { truncateToolResult, type TruncateToolResultOptions } from "@/lib/chat/truncateToolResult";
import { coerceParamsForSp } from "@/lib/pulso/spParamResolver";

const parametroItemSchema = z.object({
  nombre: z
    .string()
    .min(1)
    .describe(
      "Nombre del parámetro del SP exactamente como en el catálogo (ej. DesdeFecha, HastaFecha). Sin @.",
    ),
  valor: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .describe("Valor del parámetro. Fechas en formato dd/MM/yyyy (ej. 03/07/2026)."),
});

const ejecutarConsultaPulsoSchema = z.object({
  nombreSp: z
    .string()
    .min(1)
    .describe(
      'Nombre del Stored Procedure a ejecutar. Debe iniciar con "sp_ISG_Vision_".',
    ),
  parametros: z
    .array(parametroItemSchema)
    .optional()
    .describe(
      "Lista de parámetros del SP. Usá los nombres exactos del catálogo (DesdeFecha, HastaFecha, etc.).",
    ),
});

/** Convierte lista {nombre, valor} del LLM a Record (sin renombrar; coerceParamsForSp alinea al catálogo). */
export function normalizeToolParametros(
  parametros?: Array<{ nombre: string; valor: unknown }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of parametros ?? []) {
    const key = item.nombre.trim();
    if (!key) continue;
    out[key] = item.valor;
  }
  return out;
}

function paramsKeysOf(record: Record<string, unknown>): string {
  return Object.keys(record).join(",") || "(none)";
}

function countResultRows(result: Record<string, unknown>): number | undefined {
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result.data)) return result.data.length;
  if (typeof result.totalRows === "number") return result.totalRows;
  return undefined;
}

/** Log compacto siempre (PM2 / production). Sin filas ni valores de params. */
function logPulsoExec(opts: {
  nombreSp: string;
  ok: boolean;
  ms: number;
  code?: string;
  missing?: string[];
  paramsKeys: string;
  rows?: number;
  message?: string;
}): void {
  const parts = [
    `[pulso] exec sp=${opts.nombreSp}`,
    `ok=${opts.ok}`,
    `ms=${opts.ms}`,
    `paramsKeys=${opts.paramsKeys}`,
  ];
  if (opts.code) parts.push(`code=${opts.code}`);
  if (opts.missing?.length) parts.push(`missing=${opts.missing.join(",")}`);
  if (opts.rows != null) parts.push(`rows=${opts.rows}`);
  if (opts.message) parts.push(`message=${opts.message.slice(0, 120)}`);
  console.info(parts.join(" "));
}

/**
 * Tool principal del agente Pulso: consulta datos ERP vía isg-api-pulso.
 * Parámetros validados contra GET /SPs_arquitectura (sys.parameters).
 */
export function buildEjecutarConsultaPulsoTool(
  sessionToken: string,
  catalog: SpArquitectura[],
  truncateOptions?: TruncateToolResultOptions,
) {
  return tool({
    description: [
      "Consulta datos del ERP (ventas, clientes, stock, finanzas, catálogos maestros).",
      "Elegí el sp_ISG_Vision_* del catálogo interno; nunca preguntes al usuario qué consulta usar.",
      "Listados maestros (ej. sp_ISG_Vision_GetMarcas): ejecutá con parametros omitidos o []. No digas que no tenés acceso.",
      "Usá solo parámetros de entrada del catálogo. Si el usuario dio fechas o período (ej. «junio»), calculá FechaDesde/FechaHasta con el año actual si falta y ejecutá ANTES de responder.",
      "Nunca respondas «no hay ventas», «no encontré datos» o «no se pudo acceder» sin haber ejecutado esta tool. Si no hay match exacto, ofrecé 1–2 alternativas de negocio cercanas y pedí confirmar; no inventes fallos de acceso.",
      "Si faltan inputs requeridos del catálogo que el usuario no dio, no inventes valores: el runtime devolverá MISSING_REQUIRED_PARAMS y debés pedir el dato de negocio.",
    ].join(" "),
    inputSchema: ejecutarConsultaPulsoSchema,
    execute: async ({ nombreSp, parametros }) => {
      const started = Date.now();
      const raw = normalizeToolParametros(parametros);
      const {
        parametros: parametrosRecord,
        warnings,
        missingRequired,
      } = coerceParamsForSp(nombreSp, raw, catalog);

      const paramsKeys = paramsKeysOf(
        Object.keys(parametrosRecord).length > 0 ? parametrosRecord : raw,
      );

      if (warnings.length > 0) {
        console.warn(`[pulso] ${nombreSp} params:`, warnings.join(" | "));
      }

      const catalogSp = catalog.find(
        (sp) => getSpNombre(sp).toLowerCase() === nombreSp.toLowerCase(),
      );

      if (missingRequired.length > 0) {
        logPulsoExec({
          nombreSp,
          ok: false,
          ms: Date.now() - started,
          code: "MISSING_REQUIRED_PARAMS",
          missing: missingRequired,
          paramsKeys,
        });
        return {
          ok: false,
          code: "MISSING_REQUIRED_PARAMS",
          nombreSp,
          missingRequired,
          parametrosEsperados: catalogSp
            ? formatSpParamHint(catalogSp)
            : "(consultá listarCatalogoPulso)",
          parametrosEnviados: raw,
          avisoUsuario:
            "NO digas que no hay información ni que no hubo movimientos. " +
            "Traducí missingRequired a lenguaje de negocio y pedí esos datos al usuario. " +
            "No menciones SP, SQL ni nombres técnicos crudos de parámetros.",
        };
      }

      if (
        catalog.length > 0 &&
        Object.keys(parametrosRecord).length === 0 &&
        Object.keys(raw).length > 0
      ) {
        logPulsoExec({
          nombreSp,
          ok: false,
          ms: Date.now() - started,
          code: "INVALID_PARAMS",
          paramsKeys,
        });
        return {
          ok: false,
          code: "INVALID_PARAMS",
          nombreSp,
          message:
            "Parámetros inválidos para esa consulta. Reintentá solo con los de entrada del catálogo.",
          parametrosEsperados: catalogSp
            ? formatSpParamHint(catalogSp)
            : "(consultá listarCatalogoPulso)",
          parametrosEnviados: raw,
          avisoUsuario:
            "Decile al usuario, en lenguaje simple, que no pudiste completar la búsqueda y pedile reformular (sin mencionar SP ni parámetros).",
        };
      }

      if (!nombreSp.startsWith("sp_ISG_Vision_")) {
        logPulsoExec({
          nombreSp,
          ok: false,
          ms: Date.now() - started,
          code: "UNAUTHORIZED_SP",
          paramsKeys,
        });
        return {
          ok: false,
          code: "UNAUTHORIZED_SP",
          nombreSp,
          message: "Consulta no autorizada.",
          avisoUsuario:
            "Decile al usuario que esa consulta no está disponible y ofrecé otra forma de ayudar.",
        };
      }

      try {
        const result = await ejecutarSpPulso(
          { nombreSp, parametros: parametrosRecord },
          { sessionToken, signal: AbortSignal.timeout(25_000) },
        );
        const ms = Date.now() - started;
        if (result.ok === false) {
          const fail = result as Record<string, unknown>;
          logPulsoExec({
            nombreSp,
            ok: false,
            ms,
            code: typeof fail.code === "string" ? fail.code : "PULSO_ERROR",
            paramsKeys,
            message: typeof fail.message === "string" ? fail.message : undefined,
          });
          return truncateToolResult({
            ...result,
            nombreSp,
            warnings: warnings.length ? warnings : undefined,
            avisoUsuario:
              "Explicá el problema en una frase simple al usuario (sin jerga técnica) y ofrecé reintentar o ajustar la búsqueda.",
          }, truncateOptions);
        }
        const okResult = result as Record<string, unknown>;
        logPulsoExec({
          nombreSp,
          ok: true,
          ms,
          paramsKeys,
          rows: countResultRows(okResult),
        });
        return truncateToolResult({
          ...result,
          nombreSp,
          warnings: warnings.length ? warnings : undefined,
        }, truncateOptions);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.name === "TimeoutError"
              ? "La consulta al ERP tardó demasiado."
              : error.message
            : "Error al consultar el ERP";
        const code =
          error instanceof Error && error.name === "TimeoutError"
            ? "TIMEOUT"
            : "EXEC_ERROR";
        logPulsoExec({
          nombreSp,
          ok: false,
          ms: Date.now() - started,
          code,
          paramsKeys,
          message,
        });
        return {
          ok: false,
          code,
          message,
          nombreSp,
          parametros: parametrosRecord,
          avisoUsuario:
            "Decile al usuario que no se pudo obtener la información ahora y sugerí reintentar en unos segundos.",
        };
      }
    },
  });
}

/**
 * Catálogo bajo demanda (dependencia de confianza: cache server-side, no en el prompt).
 */
export function buildListarCatalogoPulsoTool(catalog: SpArquitectura[]) {
  return tool({
    description: [
      "Uso interno: lista consultas ERP (sp_ISG_Vision_*) y sus parámetros de entrada reales",
      "(firma CREATE PROCEDURE desde SPs_arquitectura). No menciones esto al usuario.",
    ].join(" "),
    inputSchema: z.object({
      filtro: z
        .string()
        .optional()
        .describe("Texto para filtrar por nombre o dominio (ej. ventas, stock, clientes)."),
      limite: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Cantidad máxima de SPs a devolver (default 8)."),
    }),
    execute: async ({ filtro, limite = 8 }) => {
      const base = filtro?.trim()
        ? selectRelevantSps(filtro, catalog, limite)
        : catalog.slice(0, limite);

      return {
        ok: true,
        total: base.length,
        sps: base.map((sp) => ({
          nombre: getSpNombre(sp),
          parametros: formatSpParamHint(sp),
          detalle: getSpParametros(sp).map((p) => ({
            nombre: p.nombre,
            tipo: p.tipo ?? p.type,
          })),
        })),
      };
    },
  });
}

export function buildPulsoTools(
  sessionToken: string,
  catalog: SpArquitectura[] = [],
  options?: { includeCatalogTool?: boolean; truncateOptions?: TruncateToolResultOptions },
) {
  const tools = {
    ejecutarConsultaPulso: buildEjecutarConsultaPulsoTool(
      sessionToken,
      catalog,
      options?.truncateOptions,
    ),
    ...(options?.includeCatalogTool && catalog.length > 0
      ? { listarCatalogoPulso: buildListarCatalogoPulsoTool(catalog) }
      : {}),
  };

  return tools;
}
