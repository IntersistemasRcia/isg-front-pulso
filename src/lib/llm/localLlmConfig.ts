import type { ModelDefinition } from "./types";

/** ID fijo del modelo local en el catálogo (front-agnóstico). */
export const LOCAL_LLM_MODEL_ID = "local-llm";

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

function isEnabled(): boolean {
  const flag = readEnv("LOCAL_LLM_ENABLED");
  if (!flag) return false;
  return /^(1|true|yes|on)$/i.test(flag);
}

export type LocalLlmConnection = {
  baseURL: string;
  apiKey: string;
  providerModelId: string;
};

/**
 * Proveedor local OpenAI-compatible (Ollama, LM Studio, vLLM, etc.).
 * Toda la configuración vive en env del servidor; el front solo consume /api/chat/providers.
 */
export function getLocalLlmConnection(): LocalLlmConnection | null {
  if (!isEnabled()) return null;

  const baseURL = readEnv("LOCAL_LLM_BASE_URL");
  const providerModelId = readEnv("LOCAL_LLM_MODEL");
  if (!baseURL || !providerModelId) return null;

  const apiKey = readEnv("LOCAL_LLM_API_KEY") ?? "not-needed";

  return { baseURL, apiKey, providerModelId };
}

export function isLocalLlmConfigured(): boolean {
  return getLocalLlmConnection() != null;
}

function readPositiveInt(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLocalLlmDefinition(): ModelDefinition | null {
  const conn = getLocalLlmConnection();
  if (!conn) return null;

  const label = readEnv("LOCAL_LLM_LABEL") ?? "LLM Local";
  const maxInputTokens = readPositiveInt("LOCAL_LLM_MAX_INPUT_TOKENS", 8192);
  const maxAgentSteps = readPositiveInt("LOCAL_LLM_MAX_AGENT_STEPS", 2);

  return {
    id: LOCAL_LLM_MODEL_ID,
    label,
    description:
      "Modelo en el servidor del cliente (API OpenAI-compatible). Sin cuotas cloud.",
    tier: "free",
    provider: "openai-compatible",
    providerModelId: conn.providerModelId,
    envKeys: ["LOCAL_LLM_ENABLED", "LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL"],
    /** Catálogo compacto en prompt: modelos locales fallan en tool-only sin contexto. */
    promptMode: "compact",
    maxInputTokens,
    inputHeadroomRatio: 0.65,
    toolResultMaxBytes: 2048,
    toolResultMaxRows: 15,
    messageWindowSize: 4,
    relevantSpTopK: 4,
    maxAgentSteps,
    streaming: true,
    requireToolOnFirstStep: true,
  };
}
