import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { compactUiMessagesForModel } from "@/lib/chat/compactUiMessages";
import {
  getFallbackChain,
  LlmNotConfiguredError,
  LlmQuotaExceededError,
  resolveModel,
} from "@/lib/llm/resolveModel";
import {
  buildGoogleAuthErrorMessage,
  buildQuotaExceededMessage,
  buildRequestTooLargeMessage,
  buildToolValidationMessage,
  isGoogleAuthError,
  isHttp413Error,
  isRequestTooLargeError,
  isRetriableModelError,
  isToolValidationError,
  shouldAttemptFallbackModel,
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
  rawMessageCount?: number;
};

function errorResponse(
  message: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function resolveErrorMessage(lastError: unknown): string {
  if (lastError instanceof Error && isToolValidationError(lastError)) {
    return buildToolValidationMessage();
  }
  if (isGoogleAuthError(lastError)) {
    return buildGoogleAuthErrorMessage();
  }
  if (lastError instanceof Error) {
    return formatChatStreamError(lastError);
  }
  return new LlmQuotaExceededError(undefined, lastError).message;
}

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
    rawMessageCount,
  } = options;

  let lastError: unknown;
  let failedModelId: string | undefined;

  const modelChain = [
    requestedModelId,
    ...(await getFallbackChain(userId, requestedModelId)),
  ].filter((id, index, arr) => arr.indexOf(id) === index);

  for (const modelId of modelChain) {
    const definition = getModelDefinition(modelId);
    const compactedMessages = compactUiMessagesForModel(messages, definition);
    const modelMessages = await convertToModelMessages(compactedMessages);

    const prepared = prepareChatPrompt({
      definition,
      token,
      catalog,
      messages: compactedMessages,
      historySummary,
      companyName,
      clienteId,
    });

    try {
      const resolved = await resolveModel(userId, modelId);
      const dedupedCount = rawMessageCount ?? messages.length;
      console.info(
        `[chat] model=${modelId} source=${resolved.source} ` +
          `prompt=${prepared.promptMode} tokens_est=${prepared.estimatedTokens}` +
          (prepared.tokenBudget ? ` budget=${prepared.tokenBudget}` : "") +
          ` messages=${prepared.messageCount} raw_messages=${dedupedCount} ` +
          `tool_results_kb=${prepared.toolResultsKb}`,
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
      failedModelId = modelId;

      if (isRequestTooLargeError(error) || isHttp413Error(error)) {
        console.warn(`[chat] Request too large en ${modelId}, sin fallback`);
        break;
      }

      if (shouldAttemptFallbackModel(error)) {
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

  const errorHeaders = {
    "X-Pulso-Requested-Model": requestedModelId,
    ...(failedModelId ? { "X-Pulso-Failed-Model": failedModelId } : {}),
  };

  if (lastError instanceof LlmNotConfiguredError) {
    return errorResponse(lastError.message, 503, errorHeaders);
  }

  if (
    isRequestTooLargeError(lastError) ||
    isHttp413Error(lastError)
  ) {
    return errorResponse(buildRequestTooLargeMessage(lastError), 429, errorHeaders);
  }

  if (isRetriableModelError(lastError)) {
    return errorResponse(buildQuotaExceededMessage(lastError), 429, errorHeaders);
  }

  return errorResponse(resolveErrorMessage(lastError), 500, errorHeaders);
}
