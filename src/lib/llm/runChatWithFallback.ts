import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";
import {
  getFallbackChain,
  LlmNotConfiguredError,
  LlmQuotaExceededError,
  resolveModel,
} from "@/lib/llm/resolveModel";
import {
  buildQuotaExceededMessage,
  buildRequestTooLargeMessage,
  buildToolValidationMessage,
  isRequestTooLargeError,
  isRetriableModelError,
  isToolValidationError,
} from "@/lib/llm/llmErrors";
import { formatChatStreamError } from "@/lib/llm/streamErrorMessage";
import { getModelDefinition } from "@/lib/llm/registry";
import { prepareChatPrompt } from "@/lib/llm/prepareChatPrompt";
import type { SpArquitectura } from "@/lib/pulso/types";

type RunChatOptions = {
  userId: string;
  token: string;
  requestedModelId: string;
  messages: UIMessage[];
  historySummary?: string;
  companyName?: string;
  clienteId?: string;
  catalog: SpArquitectura[];
};

/**
 * Ejecuta el agente probando modelos en cadena (generateText + tools).
 * generateText permite fallback ante 429 antes de enviar respuesta al cliente.
 */
export async function runChatWithModelFallback(options: RunChatOptions): Promise<Response> {
  const {
    userId,
    token,
    requestedModelId,
    messages,
    historySummary,
    companyName,
    clienteId,
    catalog,
  } = options;

  const modelMessages = await convertToModelMessages(messages);
  let lastError: unknown;

  const modelChain = [
    requestedModelId,
    ...(await getFallbackChain(userId, requestedModelId)),
  ].filter((id, index, arr) => arr.indexOf(id) === index);

  for (const modelId of modelChain) {
    const definition = getModelDefinition(modelId);
    const prepared = prepareChatPrompt({
      definition,
      token,
      catalog,
      messages,
      historySummary,
      companyName,
      clienteId,
    });

    try {
      const resolved = await resolveModel(userId, modelId);
      console.info(
        `[chat] Intentando modelo ${modelId} (${resolved.source}) ` +
          `[prompt=${prepared.promptMode}, ~${prepared.estimatedTokens} tok` +
          (prepared.tokenBudget ? ` / ${prepared.tokenBudget} budget` : "") +
          "]",
      );

      const result = await generateText({
        model: resolved.languageModel,
        system: prepared.system,
        messages: modelMessages,
        tools: prepared.tools,
        stopWhen: stepCountIs(5),
        maxRetries: 0,
      });

      const text =
        result.text.trim() ||
        "No pude generar una respuesta en texto. Intentá reformular la consulta.";

      const stream = createUIMessageStream({
        execute({ writer }) {
          const textId = "assistant-text";
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: text });
          writer.write({ type: "text-end", id: textId });
        },
      });

      return createUIMessageStreamResponse({
        stream,
        headers: {
          "X-Pulso-Model-Id": resolved.modelId,
          "X-Pulso-Model-Source": resolved.source,
        },
      });
    } catch (error) {
      lastError = error;
      if (isRetriableModelError(error)) {
        console.warn(`[chat] Cuota/indisponible en ${modelId}, probando siguiente…`);
        continue;
      }
      if (error instanceof LlmNotConfiguredError) {
        continue;
      }
      lastError = error;
      break;
    }
  }

  if (lastError instanceof LlmNotConfiguredError) {
    return new Response(JSON.stringify({ message: lastError.message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (isRetriableModelError(lastError)) {
    const message = isRequestTooLargeError(lastError)
      ? buildRequestTooLargeMessage(lastError)
      : buildQuotaExceededMessage(lastError);
    return new Response(JSON.stringify({ message }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message =
    lastError instanceof Error
      ? isToolValidationError(lastError)
        ? buildToolValidationMessage()
        : formatChatStreamError(lastError)
      : new LlmQuotaExceededError(undefined, lastError).message;

  return new Response(JSON.stringify({ message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
