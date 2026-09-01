import { isToolUIPart, type UIMessage } from "ai";
import type { ModelDefinition } from "@/lib/llm/types";

function summarizeToolOutput(output: unknown): string {
  if (output == null) return "[ERP: sin datos]";
  if (typeof output !== "object") return `[ERP: ${String(output).slice(0, 80)}]`;

  const obj = output as Record<string, unknown>;
  const rows =
    Array.isArray(obj.rows) ? obj.rows.length
    : Array.isArray(obj.data) ? obj.data.length
    : Array.isArray(obj.result) ? obj.result.length
    : undefined;

  const totalRows = typeof obj.totalRows === "number" ? obj.totalRows : rows;
  const truncated = Boolean(obj.truncated);

  if (totalRows != null) {
    return truncated
      ? `[ERP: ${totalRows} filas, resultado truncado en historial]`
      : `[ERP: ${totalRows} filas]`;
  }

  if (obj.ok === false && obj.message) {
    return `[ERP: error — ${String(obj.message).slice(0, 100)}]`;
  }

  return "[ERP: resultado omitido del historial para eficiencia]";
}

/**
 * Compacta tool outputs de turnos anteriores al último mensaje user (modelos con límite bajo).
 */
export function compactUiMessagesForModel(
  messages: UIMessage[],
  definition?: ModelDefinition,
): UIMessage[] {
  if (!definition?.maxInputTokens) return messages;

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex <= 0) return messages;

  return messages.map((msg, index) => {
    if (index >= lastUserIndex || msg.role !== "assistant") return msg;

    const hasToolOutput = msg.parts.some(
      (part) => isToolUIPart(part) && part.state === "output-available",
    );
    if (!hasToolOutput) return msg;

    const parts = msg.parts.map((part) => {
      if (!isToolUIPart(part) || part.state !== "output-available") return part;
      return {
        ...part,
        output: { summary: summarizeToolOutput(part.output) },
      };
    });

    return { ...msg, parts };
  });
}
