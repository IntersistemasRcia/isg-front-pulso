import { isToolUIPart, type UIMessage } from "ai";
import { UI_PREVIEW_MAX_ROWS, asObjectRows } from "@/lib/pulso/tablePreview";

const ROW_KEYS = ["rows", "previewRows", "data", "result"] as const;

/**
 * Quita arrays de filas de tool outputs antes de POST /api/chat.
 * La UI local conserva el state completo; el wire solo lleva metadata.
 */
export function stripToolRowsFromOutput(output: unknown): unknown {
  if (output == null || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const src = output as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };
  let changed = false;

  for (const key of ROW_KEYS) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }

  return changed ? next : output;
}

/**
 * Para historial SQL: conserva un adelanto de filas (preview) para reabrir tablas,
 * sin guardar el dataset completo.
 */
export function slimToolOutputForPersistence(output: unknown): unknown {
  if (output == null || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const src = output as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };

  const rawRows = Array.isArray(src.rows)
    ? src.rows
    : Array.isArray(src.previewRows)
      ? src.previewRows
      : null;

  if (rawRows?.length) {
    const preview = asObjectRows(rawRows).slice(0, UI_PREVIEW_MAX_ROWS);
    next.previewRows = preview;
    if (typeof src.totalRows !== "number") {
      next.totalRows = asObjectRows(rawRows).length;
    }
    next.totalExact = src.totalExact !== false;
  }

  delete next.rows;
  delete next.data;
  delete next.result;

  return next;
}

function mapAssistantToolOutputs(
  messages: UIMessage[],
  mapOutput: (output: unknown) => unknown,
): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;

    let partsChanged = false;
    const parts = msg.parts.map((part) => {
      if (!isToolUIPart(part) || part.state !== "output-available") {
        return part;
      }
      if (!("output" in part) || part.output == null) return part;

      const mapped = mapOutput(part.output);
      if (mapped === part.output) return part;
      partsChanged = true;
      return { ...part, output: mapped };
    });

    return partsChanged ? { ...msg, parts } : msg;
  });
}

/** Clona mensajes UI sin rows/previewRows/data/result en tool outputs. */
export function stripToolRowsForTransport(messages: UIMessage[]): UIMessage[] {
  return mapAssistantToolOutputs(messages, stripToolRowsFromOutput);
}

/** Slim para persistir historial: previewRows acotado, sin rows completos. */
export function slimMessagesForPersistence(messages: UIMessage[]): UIMessage[] {
  return mapAssistantToolOutputs(messages, slimToolOutputForPersistence);
}
