import { tool } from "ai";
import { z } from "zod";
import { ejecutarSpPulso } from "@/lib/pulso/client";
import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";
import { selectRelevantSps } from "@/lib/pulso/selectRelevantSps";
import { formatSpParamHint } from "@/lib/pulso/spParamResolver";
import type { EjecutarSpResponse, SpArquitectura } from "@/lib/pulso/types";
import { truncateToolResult, type TruncateToolResultOptions } from "@/lib/chat/truncateToolResult";
import { coerceParamsForSp } from "@/lib/pulso/spParamResolver";
import {
  RESULT_LARGE_PROBE_LIMIT,
  RESULT_LARGE_THRESHOLD,
  buildResultLargeGate,
  formatKnownTotalLabel,
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
 * Listado grande: Excel solo si hay más de 50 filas (todas);
 * tabla = adelanto de hasta 50. Nunca Excel en consultas chicas.
 */
function buildFullListadoUiPayload(options: {
  nombreSp: string;
  title: string;
  allRows: unknown[];
  optionalParamsUnused: string[];
  warnings: string[];
}): Record<string, unknown> {
  const { nombreSp, title, allRows, optionalParamsUnused, warnings } = options;
  const total = allRows.length;
  const uiRows = slicePreviewRows(allRows, UI_PREVIEW_MAX_ROWS);
  const offerExcel = total > RESULT_LARGE_THRESHOLD;
  const spec = offerExcel ? buildExcelSpecFromRows(allRows, title) : null;
  const exportId = spec ? storePulsoExcelExport(spec) : undefined;
  const filterHints = buildResultLargeGate({
    nombreSp,
    totalRows: total,
    totalExact: true,
    atLeastRows: total,
    truncated: false,
    optionalParamsUnused,
  }).optionalParamsHint;
  const hasFilters = filterHints.length > 0;
  const filterBit = hasFilters
    ? `Alternativa: preguntá si desea filtrar por ${filterHints.join(", ")} (nombre o parcial).`
    : "Si quiere acotar, pedile un criterio de negocio (nombre parcial, etc.).";

  if (!offerExcel) {
    return {
      ok: true,
      uiTable: true,
      nombreSp,
      rows: uiRows,
      previewRows: uiRows,
      totalRows: total,
      totalExact: true,
      mostrando: uiRows.length,
      truncated: false,
      columnCount: countRowColumns(allRows),
      warnings: warnings.length ? warnings : undefined,
      avisoUsuario: [
        `Hay ${total} registros; la UI ya muestra la tabla completa.`,
        "NO ofrezcas ni menciones Excel (solo se ofrece cuando hay más de 50 registros).",
        "NO armes tabla markdown.",
        UI_TABLE_AVISO,
      ].join(" "),
    };
  }

  return {
    ok: true,
    ...(exportId ? { delivery: "excel" as const, exportId } : {}),
    uiTable: true,
    nombreSp,
    rows: uiRows,
    previewRows: uiRows,
    totalRows: total,
    totalExact: true,
    mostrando: uiRows.length,
    truncated: total > uiRows.length,
    columnCount: countRowColumns(allRows),
    warnings: warnings.length ? warnings : undefined,
    avisoUsuario: [
      `Existen ${total} registros. La UI muestra las primeras ${uiRows.length}` +
        (exportId ? ` y el botón Excel con las ${total} filas completas.` : "."),
      `Respondé en 1–3 frases, tono negocio, por ejemplo: «Existen ${total} marcas; acá te muestro las primeras ${uiRows.length}. Si querés ver todas, usá el Excel de la interfaz.»`,
      filterBit,
      "NO digas un total distinto (p.ej. 51). NO armes tabla markdown.",
      UI_TABLE_AVISO,
    ].join(" "),
  };
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

        const size = resolveResultSize(result, { limiteFilas });
        let { totalRows, truncated, rows, totalExact, atLeastRows } = size;
        const title = spUiTitle(catalogSp, nombreSp);
        const optionalParamsUnused = listUnusedOptionalParams(
          nombreSp,
          parametrosRecord,
          catalog,
        );

        // Resultado grande sin modo: traer el listado COMPLETO (total real + Excel).
        // Evita el falso “51” del probe (limiteFilas) presentado como total.
        if (shouldGateLargeResult(modoResultado, totalRows, truncated)) {
          try {
            const full = (await ejecutarSpPulso(
              {
                nombreSp,
                parametros: parametrosRecord,
              },
              { sessionToken, signal: AbortSignal.timeout(25_000) },
            )) as EjecutarSpResponse;
            const fullMs = Date.now() - started;
            if (full.ok !== false) {
              const fullSize = resolveResultSize(full, { limiteFilas: null });
              if (fullSize.rows.length > 0) {
                logPulsoExec({
                  nombreSp,
                  ok: true,
                  ms: fullMs,
                  code: "EXCEL_EXPORT",
                  paramsKeys,
                  rows: fullSize.rows.length,
                });
                return buildFullListadoUiPayload({
                  nombreSp,
                  title,
                  allRows: fullSize.rows,
                  optionalParamsUnused,
                  warnings,
                });
              }
            }
          } catch (fullError) {
            console.warn(
              `[pulso] full fetch after probe failed:`,
              fullError instanceof Error ? fullError.message : fullError,
            );
          }

          const gate = buildResultLargeGate({
            nombreSp,
            totalRows,
            totalExact,
            atLeastRows,
            truncated,
            optionalParamsUnused,
          });
          logPulsoExec({
            nombreSp,
            ok: false,
            ms: Date.now() - started,
            code: "RESULT_LARGE",
            paramsKeys,
            rows: totalExact ? totalRows : atLeastRows,
          });
          return gate;
        }

        // Listado completo pedido explícitamente.
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
                "No hubo filas para exportar. Decíselo al usuario en una frase simple.",
            };
          }
          logPulsoExec({
            nombreSp,
            ok: true,
            ms,
            code: "EXCEL_EXPORT",
            paramsKeys,
            rows: rows.length,
          });
          return buildFullListadoUiPayload({
            nombreSp,
            title,
            allRows: rows,
            optionalParamsUnused,
            warnings,
          });
        }

        // preview50: solo adelanto en tabla; Excel SOLO si ya tenemos el total exacto
        // de un fetch completo (no armar Excel con 50 filas etiquetado como “completo”).
        const payloadRows =
          modoResultado === "preview50"
            ? rows.slice(0, RESULT_LARGE_THRESHOLD)
            : rows;

        logPulsoExec({
          nombreSp,
          ok: true,
          ms,
          paramsKeys,
          rows: totalExact ? totalRows : atLeastRows,
        });

        if (!modoResultado && payloadRows.length > RESULT_LARGE_THRESHOLD) {
          return buildResultLargeGate({
            nombreSp,
            totalRows: payloadRows.length,
            totalExact: false,
            atLeastRows: Math.max(atLeastRows, payloadRows.length),
            truncated: true,
            optionalParamsUnused,
          });
        }

        const columnCount = countRowColumns(payloadRows);
        const uiRows = slicePreviewRows(payloadRows, UI_PREVIEW_MAX_ROWS);
        const wide = columnCount > WIDE_COLUMN_THRESHOLD;
        const totalLabel = formatKnownTotalLabel({
          totalExact,
          totalRows,
          atLeastRows,
        });

        // Excel SOLO si hay más de 50 filas (listado grande). Nunca por “tabla ancha”.
        let exportId: string | undefined;
        const exactTotalCount = totalExact ? totalRows : payloadRows.length;
        if (
          totalExact &&
          !truncated &&
          exactTotalCount > RESULT_LARGE_THRESHOLD
        ) {
          const spec = buildExcelSpecFromRows(payloadRows, title);
          if (spec) exportId = storePulsoExcelExport(spec);
        }

        return {
          ok: true,
          uiTable: true,
          nombreSp,
          rows: uiRows,
          previewRows: uiRows,
          totalRows: totalExact ? totalRows : undefined,
          totalExact,
          atLeastRows,
          mostrando: uiRows.length,
          columnCount,
          truncated:
            truncated ||
            payloadRows.length > uiRows.length ||
            (totalExact && totalRows > uiRows.length),
          ...(exportId ? { delivery: "excel" as const, exportId } : {}),
          warnings: warnings.length ? warnings : undefined,
          avisoUsuario: [
            UI_TABLE_AVISO,
            modoResultado === "preview50"
              ? totalExact
                ? `Existen ${totalRows} registros; la UI muestra las primeras ${uiRows.length}. NO digas que son todas.`
                : `La UI muestra las primeras ${uiRows.length}. Hay ${totalLabel} registros; NO inventes un total exacto.`
              : exactTotalCount <= RESULT_LARGE_THRESHOLD
                ? `Hay ${exactTotalCount} registros; la tabla ya muestra todo.`
                : "",
            wide
              ? "Hay muchas columnas: la UI hace scroll horizontal."
              : "",
            exportId
              ? "Hay botón Excel con el listado completo (>50 filas) en la UI; mencionálo."
              : "NO ofrezcas ni menciones Excel: solo se ofrece cuando hay más de 50 registros.",
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
