/** Desenvuelve AI_RetryError y errores anidados del AI SDK. */
export function unwrapLlmError(error: unknown): unknown {
  if (!error || typeof error !== "object") return error;

  const err = error as {
    lastError?: unknown;
    errors?: unknown[];
    reason?: string;
    cause?: unknown;
  };

  if (err.lastError) {
    return unwrapLlmError(err.lastError);
  }

  if (
    err.reason === "maxRetriesExceeded" &&
    Array.isArray(err.errors) &&
    err.errors.length > 0
  ) {
    return unwrapLlmError(err.errors[err.errors.length - 1]);
  }

  if (err.cause) {
    return unwrapLlmError(err.cause);
  }

  return error;
}

export function getLlmErrorMessage(error: unknown): string {
  const unwrapped = unwrapLlmError(error);
  if (unwrapped instanceof Error) return unwrapped.message;
  return String(unwrapped ?? "");
}

/**
 * Tipo de cuota Gemini según body del error.
 * - "daily"      → cuota diaria de requests o tokens agotada
 * - "minute"     → cuota por minuto (RPM o TPM); reintentable en ~60s
 * - "spend_cap"  → tope mensual en USD (Billing Spend Cap configurado en GCP)
 * - "unknown"    → 429/403 sin body diferenciable
 */
export type GeminiQuotaKind = "daily" | "minute" | "spend_cap" | "unknown";

/**
 * Parsea el body del error de Gemini para distinguir el tipo de cuota.
 * Fuentes chequeadas: message del SDK, data.error.message, responseBody raw.
 * Solo se llama desde el backend; nunca se expone data sensible al cliente.
 */
export function getGeminiQuotaKind(error: unknown): GeminiQuotaKind {
  const text = getLlmErrorMessage(error);

  // Spend Cap (Billing): GCP devuelve 403 con estos indicadores
  if (
    /BILLING_DISABLED|billingDisabled|billing.*disabled/i.test(text) ||
    /budget.*exceeded|spend.*cap|monthly.*limit.*exceeded|billing.*quota/i.test(text) ||
    /BILLING_NOT_ACTIVE|billing is not active/i.test(text)
  ) {
    return "spend_cap";
  }

  // Cuota diaria (tokens o requests por día)
  if (/PerDay|GenerateRequestsPerDay|per day|daily|RESOURCE_EXHAUSTED.*day/i.test(text)) {
    return "daily";
  }

  // Cuota por minuto (RPM / TPM — reintentable)
  if (/PerMinute|GenerateRequestsPerMinute|per minute|RATE_LIMIT_EXCEEDED|rateLimitExceeded/i.test(text)) {
    return "minute";
  }

  // Fallback: si es 429/RESOURCE_EXHAUSTED sin detalle → tratar como diaria
  const unwrapped = unwrapLlmError(error);
  if (unwrapped && typeof unwrapped === "object") {
    const err = unwrapped as { status?: number; statusCode?: number; message?: string };
    const status = err.status ?? err.statusCode;
    const msg = (err.message ?? "").toLowerCase();
    if (status === 429 && /resource_exhausted|quota/i.test(msg)) {
      return "daily";
    }
  }

  return "unknown";
}

export function isRateLimitError(error: unknown): boolean {
  const unwrapped = unwrapLlmError(error);
  if (!unwrapped || typeof unwrapped !== "object") return false;

  const err = unwrapped as {
    status?: number;
    statusCode?: number;
    message?: string;
    data?: { error?: { code?: string; message?: string } };
  };

  const status = err.status ?? err.statusCode;
  if (status === 429 || status === 413) return true;

  const message = String(
    err.message ?? err.data?.error?.message ?? "",
  ).toLowerCase();
  const errorCode = err.data?.error?.code;

  return (
    message.includes("429") ||
    message.includes("413") ||
    message.includes("rate limit") ||
    message.includes("rate_limit_exceeded") ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("request too large") ||
    message.includes("tokens per minute") ||
    errorCode === "rate_limit_exceeded"
  );
}

/** Groq free tier: el prompt supera el límite TPM del modelo. */
export function isRequestTooLargeError(error: unknown): boolean {
  const text = getLlmErrorMessage(error).toLowerCase();
  return (
    text.includes("request too large") ||
    text.includes("reduce your message size") ||
    text.includes("tokens per minute")
  );
}

export function buildRequestTooLargeMessage(_error?: unknown): string {
  return (
    "La consulta es demasiado grande para el modelo Groq gratuito (límite ~8000 tokens por request). " +
    "El sistema ya usa un catálogo compacto para Groq; si persiste, probá con Gemini en el selector " +
    "o acortá el historial del chat."
  );
}

export function isToolValidationError(error: unknown): boolean {
  const text = getLlmErrorMessage(error).toLowerCase();
  return (
    text.includes("tool call validation failed") ||
    text.includes("did not match schema") ||
    text.includes("invalid tool")
  );
}

export function buildToolValidationMessage(): string {
  return (
    "El modelo envió parámetros en un formato inválido para la consulta ERP. " +
    "Intentá de nuevo; si persiste, reformulá la pregunta o cambiá de modelo en el selector."
  );
}

export function isModelUnavailableError(error: unknown): boolean {
  const unwrapped = unwrapLlmError(error);
  if (!unwrapped || typeof unwrapped !== "object") return false;

  const err = unwrapped as {
    status?: number;
    statusCode?: number;
    message?: string;
    data?: { error?: { code?: string; message?: string } };
  };

  const status = err.status ?? err.statusCode;
  const message = String(err.message ?? err.data?.error?.message ?? "").toLowerCase();
  const errorCode = err.data?.error?.code;

  if (status !== 404) return false;

  return (
    message.includes("no longer available") ||
    message.includes("not found") ||
    message.includes("not_found") ||
    message.includes("does not exist") ||
    errorCode === "model_not_found"
  );
}

export function isHttp413Error(error: unknown): boolean {
  const unwrapped = unwrapLlmError(error);
  if (!unwrapped || typeof unwrapped !== "object") return false;
  const err = unwrapped as { status?: number; statusCode?: number };
  const status = err.status ?? err.statusCode;
  return status === 413;
}

/** Error de autenticación de Google Gemini (clave inválida o formato incorrecto). */
export function isGoogleAuthError(error: unknown): boolean {
  const text = getLlmErrorMessage(error).toLowerCase();
  return (
    text.includes("invalid authentication credentials") ||
    text.includes("oauth 2 access token") ||
    text.includes("api key not valid") ||
    text.includes("api_key_invalid")
  );
}

export function buildGoogleAuthErrorMessage(): string {
  return (
    "No se pudo autenticar con Google Gemini. Verificá GOOGLE_FREE_API_KEY " +
    "(formato AIza… o AQ.…) en el servidor y reiniciá el servicio. " +
    "Si usás clave AQ., asegurate de que el proyecto tenga la API de Gemini habilitada."
  );
}

/**
 * Indica si conviene probar otro modelo en la cadena de fallback.
 * 413 / request too large NO hace fallback (evita saltar a Gemini con clave rota).
 */
export function shouldAttemptFallbackModel(error: unknown): boolean {
  if (isRequestTooLargeError(error) || isHttp413Error(error)) return false;
  if (isModelUnavailableError(error)) return true;
  return isRateLimitError(error);
}

export function isRetriableModelError(error: unknown): boolean {
  return shouldAttemptFallbackModel(error);
}

/**
 * Mensaje claro según tipo de cuota Gemini.
 * @param lastError - error original para parsear el tipo de cuota.
 * @param isHosted  - true si el modelo es del tier hosted/empresa (Pulso IA Premium).
 */
export function buildQuotaExceededMessage(lastError?: unknown, isHosted = false): string {
  const kind = lastError ? getGeminiQuotaKind(lastError) : "unknown";

  // --- Tier hosted (Pulso IA Premium) ---
  if (isHosted) {
    if (kind === "spend_cap") {
      return (
        "Se alcanzó el límite de facturación mensual del plan Pulso IA Premium. " +
        "Comunicate con el administrador para revisar los cupos del mes."
      );
    }
    if (kind === "daily") {
      return (
        "Se agotó el cupo diario de consultas del plan Pulso IA Premium. " +
        "El servicio se reactivará automáticamente mañana. Si necesitás más capacidad, comunicate con el administrador."
      );
    }
    if (kind === "minute") {
      return (
        "Demasiadas consultas en poco tiempo. Esperá 1 minuto y volvé a intentar."
      );
    }
    return (
      "El modelo IA del plan Premium está temporalmente no disponible. " +
      "Intentá de nuevo en unos minutos o comunicate con el administrador."
    );
  }

  // --- Tier free ---
  if (kind === "daily") {
    return (
      "Agotaste la cuota gratuita diaria de Gemini (aprox. 20 consultas por día en tier free). " +
      "Esperar unos minutos no alcanza: probá mañana, agregá GROQ_API_KEY en .env.local para usar GPT-OSS 120B (Groq), " +
      "o configurá tu propia API key en Configuración IA."
    );
  }

  if (kind === "minute") {
    return (
      "Límite de consultas por minuto alcanzado en el modelo gratuito. " +
      "Esperá 1 minuto e intentá de nuevo, o elegí otro modelo en el selector."
    );
  }

  if (kind === "spend_cap") {
    return (
      "El acceso al modelo está temporalmente bloqueado por límite de facturación. " +
      "Comunicate con el administrador del sistema."
    );
  }

  return (
    "Cuota del modelo gratuito agotada. Configurá `GROQ_API_KEY` en `.env.local`, " +
    "usá una API key en Configuración IA, o reintentá más tarde."
  );
}
