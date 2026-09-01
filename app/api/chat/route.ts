import { NextRequest } from "next/server";
import type { UIMessage } from "ai";
import { DEFAULT_MODEL_ID, getModelDefinition, normalizeModelId } from "@/lib/llm";
import { runChatWithModelFallback } from "@/lib/llm/runChatWithFallback";
import { normalizeChatMessages } from "@/lib/chat/normalizeChatMessages";
import { windowMessages } from "@/lib/chat/windowMessages";
import type { SpArquitectura } from "@/lib/pulso/types";
import {
  getPulsoApiBaseUrl,
  getSpsArquitecturaCached,
} from "@/lib/pulso";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";
/** LLM local (Ollama) puede superar 60s; IIS/ARR debe tener timeout ≥ 300s. */
export const maxDuration = 300;

/**
 * Orquestador de chat Pulso:
 * valida JWT → catálogo SPs → tools → multi-LLM con fallback en 429/404.
 * POST /api/chat
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const user = auth.user;
  const token = auth.token;

  if (!getPulsoApiBaseUrl()) {
    return new Response(
      JSON.stringify({
        message:
          "NEXT_PUBLIC_PULSO_API_URL (o PULSO_API_URL) no configurada",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await request.json()) as {
    messages: UIMessage[];
    modelId?: string;
  };
  const allMessages = body.messages ?? [];
  const rawMessageCount = allMessages.length;
  const normalizedMessages = normalizeChatMessages(allMessages);
  const requestedModelId = normalizeModelId(
    body.modelId?.trim() || DEFAULT_MODEL_ID,
  );
  const modelDef = getModelDefinition(requestedModelId);
  const windowSize = modelDef?.messageWindowSize ?? 12;
  const { messages, historySummary } = windowMessages(normalizedMessages, windowSize);

  let catalog: SpArquitectura[] = [];
  try {
    catalog = await getSpsArquitecturaCached(token);
  } catch (error) {
    console.error("[chat] SPs_arquitectura:", error);
  }

  return runChatWithModelFallback({
    userId: user.id,
    token,
    requestedModelId,
    messages,
    historySummary,
    companyName: user.companyName,
    clienteId: user.clienteId,
    catalog,
    rawMessageCount,
  });
}
