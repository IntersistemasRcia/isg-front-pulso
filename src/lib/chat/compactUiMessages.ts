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
    : typeof obj.mostrando === "number" ? obj.mostrando
    : undefined;

  const totalExact = obj.totalExact === true;
  const totalRows =
    typeof obj.totalRows === "number" ? obj.totalRows : rows;
  const truncated = Boolean(obj.truncated);
  const hayExcel = obj.delivery === "excel" && typeof obj.exportId === "string";

  if (obj.ok === false && obj.code === "RESULT_LARGE") {
    return `[ERP: RESULT_LARGE — ${totalExact && totalRows != null ? `${totalRows} filas` : "más de 50"}]`;
  }

  if (obj.ok === false && obj.message) {
    return `[ERP: error — ${String(obj.message).slice(0, 100)}]`;
  }

  if (totalRows != null) {
    const exactBit = totalExact ? "exacto" : "aprox";
    const truncBit = truncated ? ", adelanto en historial" : "";
    const excelBit = hayExcel ? ", excel" : "";
    return `[ERP: ${totalRows} filas (${exactBit}${truncBit}${excelBit})]`;
  }

  return "[ERP: resultado omitido del historial para eficiencia]";
}

function clipAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= ASSISTANT_TEXT_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, ASSISTANT_TEXT_MAX_CHARS)}… [respuesta recortada]`;
}

/**
 * Compacta historial para TODOS los modelos cloud/local:
 * - Tool outputs de turnos anteriores al último user → resumen de 1 línea (sin filas).
 * - Texto de asistente anterior → recorte corto.
 * El mensaje del último turno de usuario (y posteriores) se deja intacto para la UI/tools.
 */
export function compactUiMessagesForModel(
  messages: UIMessage[],
  _definition?: ModelDefinition,
): UIMessage[] {
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
