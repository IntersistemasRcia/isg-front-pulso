import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getByokApiKey } from "./byokStorage";
import { isValidGoogleGeminiKey } from "./googleApiKey";
import { buildQuotaExceededMessage } from "./llmErrors";
import { getLocalLlmConnection, LOCAL_LLM_MODEL_ID } from "./localLlmConfig";
import {
  DEFAULT_MODEL_ID,
  getFullModelCatalog,
  getModelDefinition,
  normalizeModelId,
} from "./registry";
import type { ApiKeySource, ByokProviderId, ModelDefinition } from "./types";

export {
  isModelUnavailableError,
  isRateLimitError,
  isRetriableModelError,
  unwrapLlmError,
} from "./llmErrors";

export class LlmNotConfiguredError extends Error {
  readonly code = "LLM_NOT_CONFIGURED" as const;
  readonly modelId: string;

  constructor(modelId: string, message?: string) {
    super(message ?? `Modelo ${modelId} no disponible: falta configuración de API key.`);
    this.name = "LlmNotConfiguredError";
    this.modelId = modelId;
  }
}

export class LlmQuotaExceededError extends Error {
  readonly code = "LLM_QUOTA_EXCEEDED" as const;

  constructor(message?: string, cause?: unknown) {
    super(message ?? buildQuotaExceededMessage(cause));
    this.name = "LlmQuotaExceededError";
  }
}

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

function firstEnv(keys: string[] | undefined): string | null {
  if (!keys) return null;
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return null;
}

function isGoogleProvider(provider: ModelDefinition["provider"]): boolean {
  return provider === "google" || provider === "google-free";
}

async function resolveApiKey(
  userId: string,
  definition: ModelDefinition,
): Promise<{ apiKey: string; source: ApiKeySource } | null> {
  if (definition.provider === "openai-compatible") {
    const conn = getLocalLlmConnection();
    if (!conn) return null;
    return { apiKey: conn.apiKey, source: "free" };
  }

  if (definition.byokProvider) {
    const byok = await getByokApiKey(userId, definition.byokProvider);
    if (byok) {
      if (definition.byokProvider === "google" && !isValidGoogleGeminiKey(byok)) {
        return null;
      }
      return { apiKey: byok, source: "byok" };
    }
  }

  const company = firstEnv(definition.envKeys);
  if (company && definition.tier === "premium") {
    if (isGoogleProvider(definition.provider) && !isValidGoogleGeminiKey(company)) {
      return null;
    }
    return { apiKey: company, source: "company" };
  }

  if (definition.tier === "free") {
    const freeKey = firstEnv(definition.envKeys);
    if (freeKey) {
      if (isGoogleProvider(definition.provider) && !isValidGoogleGeminiKey(freeKey)) {
        return null;
      }
      return { apiKey: freeKey, source: "free" };
    }
  }

  return null;
}

function buildLanguageModel(
  definition: ModelDefinition,
  apiKey: string,
): LanguageModel {
  switch (definition.provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(definition.providerModelId);
    }
    case "openai-compatible": {
      const conn = getLocalLlmConnection();
      if (!conn) {
        throw new Error("LOCAL_LLM no configurado");
      }
      const client = createOpenAI({
        baseURL: conn.baseURL,
        apiKey: conn.apiKey,
      });
      return client(definition.providerModelId);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(definition.providerModelId);
    }
    case "google":
    case "google-free": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(definition.providerModelId);
    }
    case "groq": {
      const groq = createGroq({ apiKey });
      return groq(definition.providerModelId);
    }
    default: {
      const _exhaustive: never = definition.provider;
      throw new Error(`Proveedor no soportado: ${String(_exhaustive)}`);
    }
  }
}

/** Resuelve un modelo según prioridad: BYOK usuario > env empresa > env free. */
export async function resolveModel(userId: string, modelId: string) {
  const definition = getModelDefinition(normalizeModelId(modelId));
  if (!definition) {
    throw new LlmNotConfiguredError(modelId, `Modelo desconocido: ${modelId}`);
  }

  const resolved = await resolveApiKey(userId, definition);
  if (!resolved) {
    throw new LlmNotConfiguredError(definition.id);
  }

  return {
    modelId: definition.id,
    provider: definition.provider,
    source: resolved.source,
    languageModel: buildLanguageModel(definition, resolved.apiKey),
  };
}

/** Cadena de fallback ante rate limit (429): otros modelos free configurados, luego premium. */
export async function getFallbackChain(
  userId: string,
  modelId: string,
): Promise<string[]> {
  const normalizedId = normalizeModelId(modelId);
  const chain: string[] = [];

  const freeModels = getFullModelCatalog().filter(
    (m) => m.tier === "free" && m.id !== normalizedId,
  );
  for (const model of freeModels) {
    if (await isModelConfigured(userId, model.id)) {
      chain.push(model.id);
    }
  }

  if (
    normalizedId !== DEFAULT_MODEL_ID &&
    !chain.includes(DEFAULT_MODEL_ID) &&
    (await isModelConfigured(userId, DEFAULT_MODEL_ID))
  ) {
    chain.unshift(DEFAULT_MODEL_ID);
  }

  if (
    normalizedId !== LOCAL_LLM_MODEL_ID &&
    !chain.includes(LOCAL_LLM_MODEL_ID) &&
    (await isModelConfigured(userId, LOCAL_LLM_MODEL_ID))
  ) {
    chain.unshift(LOCAL_LLM_MODEL_ID);
  }

  const premiumModels = getFullModelCatalog().filter(
    (m) => m.tier === "premium" && m.id !== normalizedId,
  );
  for (const model of premiumModels) {
    if (await isModelConfigured(userId, model.id)) {
      chain.push(model.id);
    }
  }

  return [...new Set(chain)];
}

export async function isModelConfigured(
  userId: string,
  modelId: string,
): Promise<boolean> {
  const definition = getModelDefinition(modelId);
  if (!definition) return false;
  const key = await resolveApiKey(userId, definition);
  return Boolean(key);
}

export function companyEnvConfigured(provider: ByokProviderId): boolean {
  const map: Record<ByokProviderId, string[]> = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GOOGLE_API_KEY"],
  };
  const key = firstEnv(map[provider]);
  if (provider === "google") {
    return isValidGoogleGeminiKey(key);
  }
  return Boolean(key);
}
