import type { ByokProviderId, ModelDefinition } from "./types";

export const MODEL_STORAGE_KEY = "pulso.chat.modelId";

export const DEFAULT_MODEL_ID = "gemini-2.0-flash";

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
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    description: "Modelo gratuito de Google (tier free del despliegue).",
    tier: "free",
    provider: "google-free",
    providerModelId: "gemini-2.0-flash",
    envKeys: ["GOOGLE_FREE_API_KEY"],
  },
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    description: "Modelo gratuito vía Groq (si está configurado).",
    tier: "free",
    provider: "groq",
    providerModelId: "llama-3.3-70b-versatile",
    envKeys: ["GROQ_API_KEY"],
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
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

export function listModelsByTier(tier: ModelDefinition["tier"]): ModelDefinition[] {
  return MODEL_CATALOG.filter((m) => m.tier === tier);
}