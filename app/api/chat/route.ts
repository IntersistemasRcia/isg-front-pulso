import { NextRequest } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getFallbackChain,
  isRateLimitError,
  LlmNotConfiguredError,
  LlmQuotaExceededError,
  resolveModel,
} from "@/lib/llm";
import { windowMessages } from "@/lib/chat/windowMessages";
import type { SpArquitectura } from "@/lib/pulso/types";
import {
  buildPulsoSystemPrompt,
  buildPulsoTools,
  getPulsoApiBaseUrl,
  getSpsArquitecturaCached,
} from "@/lib/pulso";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Orquestador de chat Pulso:
 * valida JWT → catálogo SPs → tools → multi-LLM con fallback en 429.
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
  const requestedModelId = body.modelId?.trim() || DEFAULT_MODEL_ID;
  const { messages, historySummary } = windowMessages(allMessages);

  let catalog: SpArquitectura[] = [];
  try {
    catalog = await getSpsArquitecturaCached(token);
  } catch (error) {
    console.error("[chat] SPs_arquitectura:", error);
  }

  const tools = buildPulsoTools(token);
  const system = buildPulsoSystemPrompt({
    companyName: user.companyName,
    clienteId: user.clienteId,
    catalog,
    historySummary,
  });

  const modelChain = [
    requestedModelId,
    ...(await getFallbackChain(user.id, requestedModelId)),
  ].filter((id, index, arr) => arr.indexOf(id) === index);

  let lastError: unknown;

  for (const modelId of modelChain) {
    try {
      const resolved = await resolveModel(user.id, modelId);
      const result = streamText({
        model: resolved.languageModel,
        system,
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(5),
      });

      return result.toUIMessageStreamResponse({
        headers: {
          "X-Pulso-Model-Id": resolved.modelId,
          "X-Pulso-Model-Source": resolved.source,
        },
      });
    } catch (error) {
      lastError = error;
      if (isRateLimitError(error)) {
        console.warn(`[chat] Rate limit en ${modelId}, probando fallback…`);
        continue;
      }
      if (error instanceof LlmNotConfiguredError) {
        continue;
      }
      throw error;
    }
  }

  if (lastError instanceof LlmNotConfiguredError) {
    return new Response(JSON.stringify({ message: lastError.message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (isRateLimitError(lastError)) {
    return new Response(
      JSON.stringify({ message: new LlmQuotaExceededError().message }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : "No se pudo iniciar el modelo de chat.";
  return new Response(JSON.stringify({ message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}