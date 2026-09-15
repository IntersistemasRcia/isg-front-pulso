import { isToolUIPart, type UIMessage } from "ai";

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

/** Clona mensajes UI sin rows/previewRows/data/result en tool outputs. */
export function stripToolRowsForTransport(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;

    let partsChanged = false;
    const parts = msg.parts.map((part) => {
      if (!isToolUIPart(part) || part.state !== "output-available") {
        return part;
      }
      if (!("output" in part) || part.output == null) return part;

      const stripped = stripToolRowsFromOutput(part.output);
      if (stripped === part.output) return part;
      partsChanged = true;
      return { ...part, output: stripped };
    });

    return partsChanged ? { ...msg, parts } : msg;
  });
}
