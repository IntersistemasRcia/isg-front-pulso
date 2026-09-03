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
      "Consulta datos del ERP (ventas, clientes, stock, finanzas).",
      "Elegí el sp_ISG_Vision_* del catálogo interno; nunca preguntes al usuario qué consulta usar.",
      "Usá solo parámetros de entrada del catálogo. Si el usuario dio fechas o período, calculá DesdeFecha/HastaFecha y ejecutá.",
    ].join(" "),
    inputSchema: ejecutarConsultaPulsoSchema,
    execute: async ({ nombreSp, parametros }) => {
      const raw = normalizeToolParametros(parametros);
      const { parametros: parametrosRecord, warnings } = coerceParamsForSp(
        nombreSp,
        raw,
        catalog,
      );

      if (warnings.length > 0) {
        console.warn(`[pulso] ${nombreSp} params:`, warnings.join(" | "));
      }

      if (
        catalog.length > 0 &&
        Object.keys(parametrosRecord).length === 0 &&
        Object.keys(raw).length > 0
      ) {
        const expected = catalog.find(
          (sp) => sp.nombre.toLowerCase() === nombreSp.toLowerCase(),
        );
        return {
          ok: false,
          message:
            "Parámetros inválidos para esa consulta. Reintentá solo con los de entrada del catálogo.",
          parametrosEsperados: expected
            ? formatSpParamHint(expected)
            : "(consultá listarCatalogoPulso)",
          parametrosEnviados: raw,
          avisoUsuario:
            "Decile al usuario, en lenguaje simple, que no pudiste completar la búsqueda y pedile reformular (sin mencionar SP ni parámetros).",
        };
      }

      if (!nombreSp.startsWith("sp_ISG_Vision_")) {
        return {
          ok: false,
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
        if (result.ok === false) {
          return truncateToolResult({
            ...result,
            warnings: warnings.length ? warnings : undefined,
            avisoUsuario:
              "Explicá el problema en una frase simple al usuario (sin jerga técnica) y ofrecé reintentar o ajustar la búsqueda.",
          }, truncateOptions);
        }
        return truncateToolResult({
          ...result,
          warnings: warnings.length ? warnings : undefined,
        }, truncateOptions);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.name === "TimeoutError"
              ? "La consulta al ERP tardó demasiado."
              : error.message
            : "Error al consultar el ERP";
        return {
          ok: false,
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
