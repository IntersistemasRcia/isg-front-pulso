import { isToolUIPart, type UIMessage } from "ai";
import type { ModelDefinition } from "@/lib/llm/types";

const ASSISTANT_TEXT_MAX_CHARS = 180;

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

function clipAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= ASSISTANT_TEXT_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, ASSISTANT_TEXT_MAX_CHARS)}… [respuesta recortada]`;
}

/**
 * Compacta historial para modelos con límite bajo (Groq ~8k TPM):
 * - Tool outputs de turnos anteriores → resumen de 1 línea.
 * - Texto de asistente anterior → recorte corto.
 */
export function compactUiMessagesForModel(
  messages: UIMessage[],
  definition?: ModelDefinition,
): UIMessage[] {
  if (!definition?.maxInputTokens || definition.maxInputTokens > 10_000) {
    return messages;
  }

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex <= 0) return messages;

  return messages.map((msg, index) => {
    if (index >= lastUserIndex) return msg;

    if (msg.role === "assistant") {
      const parts = msg.parts.map((part) => {
        if (part.type === "text" && part.text.trim()) {
          return { ...part, text: clipAssistantText(part.text) };
        }
        if (isToolUIPart(part) && part.state === "output-available") {
          return {
            ...part,
            output: { summary: summarizeToolOutput(part.output) },
          };
        }
        return part;
      });
      return { ...msg, parts };
    }

    return msg;
  });
}
