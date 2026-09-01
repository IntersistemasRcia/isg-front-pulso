export type LlmProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "google-free"
  | "groq"
  | "openai-compatible";

export type ModelTier = "free" | "premium";

export type ApiKeySource = "byok" | "company" | "free";

/** Proveedor BYOK que el usuario puede configurar en ajustes. */
export type ByokProviderId = "openai" | "anthropic" | "google";

export type PromptCatalogMode = "full" | "compact" | "minimal" | "tool-only";

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
  /** Catálogo compacto (sin SQL) para proveedores con límite bajo de tokens. */
  promptMode?: PromptCatalogMode;
  /** Límite de input del proveedor; con headroom se usa ~75% como techo. */
  maxInputTokens?: number;
  inputHeadroomRatio?: number;
  /** Límite de bytes para resultados de tools ERP en este modelo. */
  toolResultMaxBytes?: number;
  /** Límite de filas para resultados de tools ERP en este modelo. */
  toolResultMaxRows?: number;
  /** Mensajes máximos de historial enviados al modelo. */
  messageWindowSize?: number;
  /** SPs relevantes en el prompt (ranking léxico). */
  relevantSpTopK?: number;
  /** Pasos máximos del agente (tool loops). Por defecto 5. */
  maxAgentSteps?: number;
  /** Si true, responde con streaming SSE (mejor UX y timeouts de proxy). */
  streaming?: boolean;
  /** Obliga tool call en el paso 0 (evita que modelos locales pregunten al usuario). */
  requireToolOnFirstStep?: boolean;
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

export interface LlmProvidersApiResponse {
  models: ProviderAvailability[];
  freeTierConfigured: boolean;
  setupHint?: string;
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