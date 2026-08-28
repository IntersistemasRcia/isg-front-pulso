import { tool } from "ai";
import { z } from "zod";
import { ejecutarSpPulso } from "@/lib/pulso/client";
import { truncateToolResult } from "@/lib/chat/truncateToolResult";

const ejecutarConsultaPulsoSchema = z.object({
  nombreSp: z
    .string()
    .min(1)
    .describe(
      'Nombre del Stored Procedure a ejecutar. Debe iniciar con "sp_ISG_Vision_".',
    ),
  parametros: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Diccionario clave-valor con los parámetros del SP (ej. @DesdeFecha, @HastaFecha, @IDSucursal). Fechas en YYYY-MM-DD.",
    ),
});

/**
 * Tool principal del agente Pulso: consulta datos ERP vía isg-api-pulso.
 */
export function buildEjecutarConsultaPulsoTool(sessionToken: string) {
  return tool({
    description: [
      "Ejecuta una consulta de datos comerciales/financieros en el ERP del cliente",
      "mediante un Stored Procedure de la suite sp_ISG_Vision_.",
      "Usá esta herramienta cuando el usuario pida ventas, stock, cuentas a cobrar, finanzas u otros datos del ERP.",
      "Elegí el SP correcto según el catálogo de arquitectura del system prompt.",
    ].join(" "),
    inputSchema: ejecutarConsultaPulsoSchema,
    execute: async ({ nombreSp, parametros }) => {
      if (!nombreSp.startsWith("sp_ISG_Vision_")) {
        return {
          ok: false,
          message:
            'El nombreSp debe iniciar con "sp_ISG_Vision_". Revisá el catálogo de arquitectura.',
          nombreSp,
        };
      }

      try {
        const result = await ejecutarSpPulso(
          { nombreSp, parametros },
          { sessionToken },
        );
        return truncateToolResult(result);
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido al ejecutar consulta Pulso",
          nombreSp,
          parametros: parametros ?? {},
        };
      }
    },
  });
}

export function buildPulsoTools(sessionToken: string) {
  return {
    ejecutarConsultaPulso: buildEjecutarConsultaPulsoTool(sessionToken),
  };
}
