import type { ByokProviderId, ModelDefinition } from "./types";

export const MODEL_STORAGE_KEY = "pulso.chat.modelId";

export const DEFAULT_MODEL_ID = "gemini-3.6-flash";

/** IDs antiguos → modelo actual (p. ej. localStorage del cliente). */
export const LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "gemini-2.0-flash": "gemini-3.6-flash",
  /** Groq lo retiró el 2026-08-16 → openai/gpt-oss-120b */
  "llama-3.3-70b-versatile": "gpt-oss-120b",
};

export function normalizeModelId(modelId: string): string {
  return LEGACY_MODEL_ALIASES[modelId] ?? modelId;
}

export const BYOK_PROVIDERS: ReadonlyArray<{
  id: ByokProviderId;
  label: string;
  description: string;
  envFallback?: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT-4o y GPT-4o mini con tu propia API key.",
    envFallback: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude Sonnet con tu propia API key.",
    envFallback: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    label: "Google AI",
    description: "Gemini premium con tu propia API key.",
    envFallback: "GOOGLE_API_KEY",
  },
];

/** Catálogo de modelos expuestos en el selector de chat. */
export const MODEL_CATALOG: readonly ModelDefinition[] = [
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "Modelo gratuito de Google (tier free del despliegue).",
    tier: "free",
    provider: "google-free",
    providerModelId: "gemini-3.6-flash",
    envKeys: ["GOOGLE_FREE_API_KEY"],
  },
  {
    id: "gemini-2.0-flash-lite",
    label: "Gemini 2.0 Flash Lite",
    description: "Alternativa gratuita de Google (cuota diaria separada).",
    tier: "free",
    provider: "google-free",
    providerModelId: "gemini-2.0-flash-lite",
    envKeys: ["GOOGLE_FREE_API_KEY"],
  },
  {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B",
    description: "Modelo gratuito vía Groq (reemplazo oficial de Llama 3.3).",
    tier: "free",
    provider: "groq",
    providerModelId: "openai/gpt-oss-120b",
    envKeys: ["GROQ_API_KEY"],
    promptMode: "compact",
    maxInputTokens: 8000,
    inputHeadroomRatio: 0.75,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "OpenAI — requiere BYOK o clave de empresa.",
    tier: "premium",
    provider: "openai",
    providerModelId: "gpt-4o-mini",
    byokProvider: "openai",
    envKeys: ["OPENAI_API_KEY"],
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "OpenAI — requiere BYOK o clave de empresa.",
    tier: "premium",
    provider: "openai",
    providerModelId: "gpt-4o",
    byokProvider: "openai",
    envKeys: ["OPENAI_API_KEY"],
  },
  {
    id: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    description: "Anthropic — requiere BYOK o clave de empresa.",
    tier: "premium",
    provider: "anthropic",
    providerModelId: "claude-sonnet-4-20250514",
    byokProvider: "anthropic",
    envKeys: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Google premium — BYOK o GOOGLE_API_KEY de empresa.",
    tier: "premium",
    provider: "google",
    providerModelId: "gemini-2.5-pro",
    byokProvider: "google",
    envKeys: ["GOOGLE_API_KEY"],
  },
];

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  const resolvedId = normalizeModelId(modelId);
  return MODEL_CATALOG.find((m) => m.id === resolvedId);
}

export function listModelsByTier(tier: ModelDefinition["tier"]): ModelDefinition[] {
  return MODEL_CATALOG.filter((m) => m.tier === tier);
}