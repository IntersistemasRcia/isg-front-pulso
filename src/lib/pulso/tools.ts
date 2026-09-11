import { tool } from "ai";
import { z } from "zod";
import { ejecutarSpPulso } from "@/lib/pulso/client";
import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import { selectRelevantSps } from "@/lib/pulso/selectRelevantSps";
import { formatSpParamHint } from "@/lib/pulso/spParamResolver";
import type { SpArquitectura } from "@/lib/pulso/types";
import { truncateToolResult, type TruncateToolResultOptions } from "@/lib/chat/truncateToolResult";
import { coerceParamsForSp } from "@/lib/pulso/spParamResolver";
import {
  RESULT_LARGE_PROBE_LIMIT,
  RESULT_LARGE_THRESHOLD,
  listOptionalParamHints,
  resolveResultSize,
  shouldGateLargeResult,
  type ModoResultado,
} from "@/lib/pulso/resultSizeGate";
import {
  buildCompleteListadoPayload,
  buildLargePreviewPayload,
  buildSmallListadoPayload,
} from "@/lib/pulso/listadoUiPayload";
import {
  UI_PREVIEW_MAX_ROWS,
  UI_TABLE_AVISO,
  WIDE_COLUMN_THRESHOLD,
  countRowColumns,
  slicePreviewRows,
} from "@/lib/pulso/tablePreview";
import { toEjecutarConsultaModelOutput } from "@/lib/pulso/toEjecutarConsultaModelOutput";

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
  modoResultado: z
    .enum(["preview50", "completo"])
    .optional()
    .describe(
      "Tras un listado grande: preview50 = adelanto en pantalla; completo = traer todas las filas y Excel si hay más de 50. Omitir en la primera ejecución.",
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

function resolveLimiteFilas(modo: ModoResultado | undefined): number | undefined {
  if (modo === "completo") return undefined;
  if (modo === "preview50") return RESULT_LARGE_THRESHOLD;
  return RESULT_LARGE_PROBE_LIMIT;
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

function spUiTitle(
  catalogSp: SpArquitectura | undefined,
  nombreSp: string,
): string {
  return (
    catalogSp?.descripcion?.slice(0, 80) ||
    nombreSp.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ")
  );
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
      "Excel solo si hay más de 50 filas (exportId). No ofrezcas Excel en consultas chicas.",
    ].join(" "),
    inputSchema: ejecutarConsultaPulsoSchema,
    // Resumen limpio al LLM; la UI sigue recibiendo el output completo de execute.
    toModelOutput: ({ output }: { output: unknown }) =>
      toEjecutarConsultaModelOutput(output),
    execute: async ({ nombreSp, parametros, modoResultado }) => {
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
        const limiteFilas = resolveLimiteFilas(modoResultado);
        const execTimeoutMs =
          modoResultado === "completo" || limiteFilas == null ? 60_000 : 25_000;
        const result = await ejecutarSpPulso(
          {
            nombreSp,
            parametros: parametrosRecord,
            ...(limiteFilas != null ? { limiteFilas } : {}),
          },
          { sessionToken, signal: AbortSignal.timeout(execTimeoutMs) },
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

        const size = resolveResultSize(result, { limiteFilas });
        const { totalRows, truncated, rows, totalExact, atLeastRows } = size;
        const title = spUiTitle(catalogSp, nombreSp);
        const optionalParamHints = listOptionalParamHints(
          nombreSp,
          parametrosRecord,
          catalog,
        );
        const baseUi = {
          nombreSp,
          title,
          warnings,
          optionalParamHints,
        };

        // ── Completo: materializar todas las filas + Excel si >50 ────────────
        if (modoResultado === "completo") {
          if (!rows.length) {
            logPulsoExec({
              nombreSp,
              ok: false,
              ms,
              code: "EMPTY_RESULT",
              paramsKeys,
              rows: 0,
            });
            return {
              ok: false,
              code: "EMPTY_RESULT",
              nombreSp,
              totalRows: 0,
              avisoUsuario:
                "No hubo filas para exportar. Decíselo al usuario en una frase simple de negocio.",
            };
          }
          logPulsoExec({
            nombreSp,
            ok: true,
            ms,
            code:
              rows.length > RESULT_LARGE_THRESHOLD
                ? "EXCEL_EXPORT"
                : "OK_SMALL",
            paramsKeys,
            rows: rows.length,
          });
          return buildCompleteListadoPayload({ ...baseUi, allRows: rows });
        }

        // ── Grande (1ª pasada / probe): adelanto + total si el API dio COUNT ─
        // No reconsultar todo acá: el Excel completo va en modoResultado=completo.
        if (shouldGateLargeResult(modoResultado, totalRows, truncated)) {
          const previewRows = slicePreviewRows(rows, RESULT_LARGE_THRESHOLD);
          logPulsoExec({
            nombreSp,
            ok: true,
            ms,
            code: totalExact ? "LARGE_PREVIEW_EXACT" : "LARGE_PREVIEW_UNCERTAIN",
            paramsKeys,
            rows: totalExact ? totalRows : previewRows.length,
          });
          return buildLargePreviewPayload({
            ...baseUi,
            previewRows,
            size: { totalRows, totalExact, atLeastRows },
          });
        }

        // ── Preview50 explícito ──────────────────────────────────────────────
        if (modoResultado === "preview50") {
          const previewRows = rows.slice(0, RESULT_LARGE_THRESHOLD);
          logPulsoExec({
            nombreSp,
            ok: true,
            ms,
            code: "PREVIEW50",
            paramsKeys,
            rows: totalExact ? totalRows : previewRows.length,
          });
          return buildLargePreviewPayload({
            ...baseUi,
            previewRows,
            size: { totalRows, totalExact, atLeastRows },
          });
        }

        // ── Resultado chico (≤50, no truncated) ──────────────────────────────
        logPulsoExec({
          nombreSp,
          ok: true,
          ms,
          paramsKeys,
          rows: rows.length,
        });

        if (rows.length <= RESULT_LARGE_THRESHOLD) {
          return buildSmallListadoPayload({ ...baseUi, rows });
        }

        // Defensa: dataset grande sin flags de truncate del API.
        const wide = countRowColumns(rows) > WIDE_COLUMN_THRESHOLD;
        const uiRows = slicePreviewRows(rows, UI_PREVIEW_MAX_ROWS);
        return {
          ok: true,
          uiTable: true,
          nombreSp,
          rows: uiRows,
          previewRows: uiRows,
          totalRows: rows.length,
          totalExact: true,
          mostrando: uiRows.length,
          truncated: rows.length > uiRows.length,
          columnCount: countRowColumns(rows),
          warnings: warnings.length ? warnings : undefined,
          avisoUsuario: [
            UI_TABLE_AVISO,
            `Hay ${rows.length} registros; en pantalla ves un adelanto.`,
            "Para Excel completo pedí modoResultado=completo.",
            wide
              ? "Hay muchas columnas: se puede desplazar la tabla en pantalla."
              : "",
            "NO listes filas. NO digas UI/HTML/tool.",
          ]
            .filter(Boolean)
            .join(" "),
        };
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
