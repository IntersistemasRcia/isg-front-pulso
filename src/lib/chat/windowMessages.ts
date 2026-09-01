import type { UIMessage } from "ai";

const DEFAULT_WINDOW = 12;

export type WindowedMessages = {
  messages: UIMessage[];
  /** Nota de sistema con resumen textual del historial omitido. */
  historySummary?: string;
};

/**
 * Reduce el historial enviado al modelo a los últimos N mensajes.
 * Si hay más, genera un resumen textual corto (sin persistencia).
 */
export function windowMessages(
  messages: UIMessage[],
  windowSize = DEFAULT_WINDOW,
): WindowedMessages {
  if (messages.length <= windowSize) {
    return { messages };
  }

  const omitted = messages.slice(0, messages.length - windowSize);
  const recent = messages.slice(messages.length - windowSize);

  const snippets = omitted
    .map((msg) => {
      const text = msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return null;
      const clipped = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      return `${msg.role}: ${clipped}`;
    })
    .filter(Boolean)
    .slice(-6);

  const historySummary = [
    `Historial previo omitido (${omitted.length} mensajes) para eficiencia:`,
    ...snippets,
  ].join("\n");

  return { messages: recent, historySummary };
}
