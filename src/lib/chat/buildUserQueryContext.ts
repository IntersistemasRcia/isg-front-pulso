import type { UIMessage } from "ai";

const MAX_USER_MESSAGES = 3;

function extractUserText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/**
 * Concatena los últimos mensajes user para ranking de SPs y contexto de follow-ups.
 */
export function buildUserQueryContext(messages: UIMessage[]): string {
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (let i = messages.length - 1; i >= 0 && snippets.length < MAX_USER_MESSAGES; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = extractUserText(msg);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.unshift(text);
  }

  return snippets.join(" ").trim();
}

/** Bloque de contexto para follow-ups cortos (< 40 chars). */
export function buildFollowUpContextHint(messages: UIMessage[]): string | undefined {
  if (messages.length <= 1) return undefined;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return undefined;

  const lastText = extractUserText(lastUser);
  if (lastText.length >= 40) return undefined;

  const context = buildUserQueryContext(messages);
  if (!context || context === lastText) return undefined;

  return `Contexto reciente del usuario (uso interno): ${context}`;
}
