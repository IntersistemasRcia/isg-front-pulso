/** Payload compacto en X-Pulso-Sp-Candidates (Base64URL JSON). */
export type PulsoSpCandidatesHeader = {
  catalogInPrompt: boolean;
  candidates: Array<{ n: string; d?: string }>;
};

export type PulsoChatDebugInfo = {
  promptMode?: string;
  spTopK?: string;
  modelId?: string;
  modelSource?: string;
  catalogInPrompt?: boolean;
  candidates: Array<{ nombre: string; descripcion?: string }>;
};

function decodeBase64Url(value: string): string {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Lee headers de debug de la respuesta POST /api/chat. */
export function parsePulsoChatDebugHeaders(headers: Headers): PulsoChatDebugInfo | null {
  const encoded = headers.get("X-Pulso-Sp-Candidates");
  if (!encoded) return null;

  let parsed: PulsoSpCandidatesHeader | null = null;
  try {
    parsed = JSON.parse(decodeBase64Url(encoded)) as PulsoSpCandidatesHeader;
  } catch {
    try {
      parsed = JSON.parse(decodeURIComponent(encoded)) as PulsoSpCandidatesHeader;
    } catch {
      return null;
    }
  }

  const candidates = Array.isArray(parsed?.candidates)
    ? parsed.candidates.map((c) => ({
        nombre: String(c.n ?? "").trim(),
        descripcion: c.d?.trim() || undefined,
      })).filter((c) => c.nombre.length > 0)
    : [];

  return {
    promptMode: headers.get("X-Pulso-Prompt-Mode") ?? undefined,
    spTopK: headers.get("X-Pulso-Sp-Top-K") ?? undefined,
    modelId: headers.get("X-Pulso-Model-Id") ?? undefined,
    modelSource: headers.get("X-Pulso-Model-Source") ?? undefined,
    catalogInPrompt: parsed?.catalogInPrompt,
    candidates,
  };
}
