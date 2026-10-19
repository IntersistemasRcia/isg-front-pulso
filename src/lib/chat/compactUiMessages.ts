import { isToolUIPart, type UIMessage } from "ai";
import type { ModelDefinition } from "@/lib/llm/types";
import { stripToolRowsFromOutput } from "@/lib/chat/stripToolRowsForTransport";

const ASSISTANT_TEXT_MAX_CHARS = 180;

/**
 * Stub sin arrays para historial: alineado con lo que toModelOutput puede resumir
 * (ok, totales, avisoUsuario, exportId) sin reenviar filas.
 */
export function compactToolOutputForHistory(output: unknown): Record<string, unknown> {
  if (output == null || typeof output !== "object") {
    return { ok: false, summary: "[ERP: sin datos]" };
  }

  const obj = stripToolRowsFromOutput(output) as Record<string, unknown>;
  const stub: Record<string, unknown> = {};

  if (typeof obj.ok === "boolean") stub.ok = obj.ok;
  if (typeof obj.code === "string") stub.code = obj.code;
  if (typeof obj.message === "string") stub.message = obj.message;
  if (typeof obj.nombreSp === "string") stub.nombreSp = obj.nombreSp;
  if (typeof obj.totalRows === "number") stub.totalRows = obj.totalRows;
  if (obj.totalExact === true) stub.totalExact = true;
  if (typeof obj.mostrando === "number") stub.mostrando = obj.mostrando;
  if (typeof obj.atLeastRows === "number") stub.atLeastRows = obj.atLeastRows;
  if (obj.truncated === true) stub.truncated = true;
  if (obj.uiTable === true) stub.uiTable = true;
  if (typeof obj.delivery === "string") stub.delivery = obj.delivery;
  if (typeof obj.exportId === "string") stub.exportId = obj.exportId;
  if (typeof obj.columnCount === "number") stub.columnCount = obj.columnCount;
  if (typeof obj.avisoUsuario === "string") stub.avisoUsuario = obj.avisoUsuario;
  if (obj.choices != null) stub.choices = obj.choices;
  if (obj.optionalParamsHint != null) stub.optionalParamsHint = obj.optionalParamsHint;
  if (obj.missingRequired != null) stub.missingRequired = obj.missingRequired;

  if (Object.keys(stub).length === 0) {
    return { ok: true, summary: "[ERP: resultado omitido del historial para eficiencia]" };
  }

  return stub;
}

function clipAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= ASSISTANT_TEXT_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, ASSISTANT_TEXT_MAX_CHARS)}… [respuesta recortada]`;
}

/**
 * Compacta historial para TODOS los modelos cloud/local:
 * - Tool outputs de turnos anteriores al último user → metadata sin filas.
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
            output: compactToolOutputForHistory(part.output),
          };
        }
        return part;
      });
      return { ...msg, parts };
    }

    return msg;
  });
}
