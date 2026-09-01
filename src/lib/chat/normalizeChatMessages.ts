import type { UIMessage } from "ai";

function extractUserText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim()
    .toLowerCase();
}

/**
 * Elimina mensajes duplicados del body de useChat (mismo texto user consecutivo o mismo id).
 */
export function normalizeChatMessages(messages: UIMessage[]): UIMessage[] {
  const seenIds = new Set<string>();
  const result: UIMessage[] = [];

  for (const msg of messages) {
    if (seenIds.has(msg.id)) continue;
    seenIds.add(msg.id);

    const last = result[result.length - 1];
    if (
      msg.role === "user" &&
      last?.role === "user" &&
      extractUserText(msg) === extractUserText(last)
    ) {
      result[result.length - 1] = msg;
      continue;
    }

    result.push(msg);
  }

  return result;
}
