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
  buildResultLargeGate,
  listUnusedOptionalParams,
  resolveResultSize,
  shouldGateLargeResult,
  type ModoResultado,
} from "@/lib/pulso/resultSizeGate";
import {
  buildExcelSpecFromRows,
  storePulsoExcelExport,
} from "@/lib/pulso/exportStore";
import {
  UI_PREVIEW_MAX_ROWS,
  UI_TABLE_AVISO,
  WIDE_COLUMN_THRESHOLD,
  countRowColumns,
  slicePreviewRows,
} from "@/lib/pulso/tablePreview";

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
      "Tras RESULT_LARGE: preview50 = primeros 50 en el chat; completo = Excel con todos los registros (no tabla markdown). Omitir en la primera ejecución.",
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
  if (typeof result.totalRows === "number") return result.totalRows;
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result.data)) return result.data.length;
  return undefined;
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
      "Si devuelve RESULT_LARGE (>50 filas), preguntá (filtros / primeros 50 / Excel completo) y reejecutá con modoResultado; no inventes ni pegues tablas largas en markdown.",
    ].join(" "),
    inputSchema: ejecutarConsultaPulsoSchema,
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
        const result = await ejecutarSpPulso(
          {
            nombreSp,
            parametros: parametrosRecord,
            ...(limiteFilas != null ? { limiteFilas } : {}),
          },
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

        const { totalRows, truncated, rows } = resolveResultSize(result);

        if (shouldGateLargeResult(modoResultado, totalRows, truncated)) {
          const optionalParamsUnused = listUnusedOptionalParams(
            nombreSp,
            parametrosRecord,
            catalog,
          );
          const gate = buildResultLargeGate({
            nombreSp,
            totalRows,
            truncated,
            optionalParamsUnused,
          });
          logPulsoExec({
            nombreSp,
            ok: false,
            ms,
            code: "RESULT_LARGE",
            paramsKeys,
            rows: totalRows,
          });
          return gate;
        }

        // Listado completo: Excel en UI (no pasar N filas al LLM ni truncar en silencio).
        if (modoResultado === "completo") {
          const title =
            catalogSp?.descripcion?.slice(0, 80) ||
            nombreSp.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ");
          const spec = buildExcelSpecFromRows(rows, title);
          if (!spec) {
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
                "No hubo filas para exportar. Decíselo al usuario en una frase simple.",
            };
          }
          const exportId = storePulsoExcelExport(spec);
          logPulsoExec({
            nombreSp,
            ok: true,
            ms,
            code: "EXCEL_EXPORT",
            paramsKeys,
            rows: rows.length,
          });
          return {
            ok: true,
            delivery: "excel",
            uiTable: true,
            exportId,
            nombreSp,
            totalRows: rows.length,
            rows: slicePreviewRows(rows, 10),
            previewRows: slicePreviewRows(rows, 10),
            avisoUsuario: [
              `El listado completo tiene ${rows.length} registros y ya está listo para descargar en Excel (la UI muestra el botón y un adelanto).`,
              "Respondé en 1–2 frases. NO armes tabla markdown.",
              UI_TABLE_AVISO,
            ].join(" "),
          };
        }

        const previewNote =
          modoResultado === "preview50"
            ? {
                mostrando: Math.min(rows.length, RESULT_LARGE_THRESHOLD),
                totalRows,
                truncated: totalRows > RESULT_LARGE_THRESHOLD || truncated,
                nota: `Mostrando los primeros ${RESULT_LARGE_THRESHOLD} de ${totalRows} registros.`,
              }
            : undefined;

        const payloadRows =
          modoResultado === "preview50"
            ? rows.slice(0, RESULT_LARGE_THRESHOLD)
            : rows;

        logPulsoExec({
          nombreSp,
          ok: true,
          ms,
          paramsKeys,
          rows: totalRows,
        });

        // Si por algún motivo llegamos con muchas filas sin modo completo, no inundar al LLM.
        if (!modoResultado && payloadRows.length > RESULT_LARGE_THRESHOLD) {
          const optionalParamsUnused = listUnusedOptionalParams(
            nombreSp,
            parametrosRecord,
            catalog,
          );
          return buildResultLargeGate({
            nombreSp,
            totalRows: payloadRows.length,
            truncated: true,
            optionalParamsUnused,
          });
        }

        const title =
          catalogSp?.descripcion?.slice(0, 80) ||
          nombreSp.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ");
        const columnCount = countRowColumns(payloadRows);
        const uiRows = slicePreviewRows(payloadRows, UI_PREVIEW_MAX_ROWS);
        const wide = columnCount > WIDE_COLUMN_THRESHOLD;
        const needsExcel =
          wide ||
          payloadRows.length > UI_PREVIEW_MAX_ROWS ||
          modoResultado === "preview50";

        let exportId: string | undefined;
        if (needsExcel) {
          const spec = buildExcelSpecFromRows(payloadRows, title);
          if (spec) exportId = storePulsoExcelExport(spec);
        }

        // No pasar el dataset completo al LLM (tokens + tablas markdown rotas).
        // La UI lee `rows` / `exportId` desde el tool output.
        return {
          ok: true,
          uiTable: true,
          nombreSp,
          rows: uiRows,
          totalRows,
          columnCount,
          truncated:
            Boolean(previewNote?.truncated) ||
            payloadRows.length > uiRows.length ||
            (typeof totalRows === "number" && totalRows > uiRows.length),
          ...(exportId
            ? { delivery: "excel" as const, exportId }
            : {}),
          ...(previewNote ?? {}),
          warnings: warnings.length ? warnings : undefined,
          avisoUsuario: [
            UI_TABLE_AVISO,
            wide
              ? "Hay muchas columnas (p.ej. aging / cuentas a cobrar): la UI hace scroll horizontal; el Excel tiene el detalle completo del preview."
              : "",
            exportId
              ? "Hay botón de descarga Excel en la UI; mencionálo si el usuario puede querer el archivo."
              : "",
            previewNote
              ? `Son los primeros ${RESULT_LARGE_THRESHOLD} (o menos). Indicá el total si viene en totalRows. No digas que es el listado completo.`
              : "",
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
