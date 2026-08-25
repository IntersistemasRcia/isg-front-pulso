import { tool } from "ai";
import { z } from "zod";
import type { StoredProcedureTool } from "@/types";
import { executeLocalSp } from "@/lib/chat/executeLocalSp";
import { truncateToolResult } from "@/lib/chat/truncateToolResult";

/**
 * Construye el ToolSet de AI SDK solo con los SPs activos seleccionados.
 */
export function buildTools(
  activeCatalog: StoredProcedureTool[],
  clienteId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  for (const sp of activeCatalog) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, def] of Object.entries(sp.parameters.properties)) {
      if (def.type === "number") shape[key] = z.number().optional();
      else if (def.type === "boolean") shape[key] = z.boolean().optional();
      else shape[key] = z.string().optional();
    }

    tools[sp.name] = tool({
      description: sp.description,
      inputSchema: z.object(shape),
      execute: async (params) => {
        const raw = await executeLocalSp(
          sp.name,
          params as Record<string, unknown>,
          clienteId,
        );
        return truncateToolResult(raw);
      },
    });
  }

  return tools;
}
