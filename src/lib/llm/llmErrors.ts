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

/** Detecta si el 429 es cuota diaria vs por minuto (Gemini free tier). */
export function getGeminiQuotaKind(error: unknown): "daily" | "minute" | "unknown" {
  const text = getLlmErrorMessage(error);
  if (/PerDay|GenerateRequestsPerDay|per day|daily/i.test(text)) {
    return "daily";
  }
  if (/PerMinute|GenerateRequestsPerMinute|per minute/i.test(text)) {
    return "minute";
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
    "La clave GOOGLE_FREE_API_KEY del servidor no es válida. " +
    "Debe ser una API key de Google AI Studio (formato AIzaSy…). " +
    "Regenerala en https://aistudio.google.com/apikey y reiniciá el servidor."
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

/** Mensaje claro según tipo de cuota Gemini. */
export function buildQuotaExceededMessage(lastError?: unknown): string {
  const kind = lastError ? getGeminiQuotaKind(lastError) : "unknown";

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

  return (
    "Cuota del modelo gratuito agotada. Configurá `GROQ_API_KEY` en `.env.local`, " +
    "usá una API key en Configuración IA, o reintentá más tarde."
  );
}
