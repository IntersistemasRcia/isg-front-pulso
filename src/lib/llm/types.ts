export type LlmProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "google-free"
  | "groq";

export type ModelTier = "free" | "premium";

export type ApiKeySource = "byok" | "company" | "free";

/** Proveedor BYOK que el usuario puede configurar en ajustes. */
export type ByokProviderId = "openai" | "anthropic" | "google";

export interface ModelDefinition {
  id: string;
  label: string;
  description?: string;
  tier: ModelTier;
  provider: LlmProviderId;
  /** ID del modelo en el SDK del proveedor. */
  providerModelId: string;
  byokProvider?: ByokProviderId;
  /** Variables de entorno de despliegue (company o free tier). */
  envKeys?: string[];
}

export interface ProviderAvailability {
  id: string;
  label: string;
  description?: string;
  tier: ModelTier;
  available: boolean;
  requiresByok: boolean;
  configuredVia?: ApiKeySource;
}

export interface ByokProviderState {
  provider: ByokProviderId;
  configured: boolean;
  maskedKey?: string;
}

export interface ByokSettingsDto {
  providers: ByokProviderState[];
}

export interface ResolvedModel {
  modelId: string;
  provider: LlmProviderId;
  source: ApiKeySource;
  languageModel: import("ai").LanguageModel;
}