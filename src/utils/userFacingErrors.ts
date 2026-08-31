/** Códigos internos para diagnóstico (logs); el usuario ve title/message. */
export type UserErrorCode =
  | "AUTH_UNAUTHORIZED"
  | "AUTH_TOKEN_EXPIRED"
  | "PULSO_UNAUTHORIZED"
  | "PULSO_BAD_REQUEST"
  | "PULSO_FORBIDDEN"
  | "PULSO_NOT_FOUND"
  | "PULSO_SERVER_ERROR"
  | "PULSO_UNREACHABLE"
  | "PULSO_NOT_CONFIGURED"
  | "PULSO_TIMEOUT"
  | "LLM_QUOTA"
  | "LLM_NOT_CONFIGURED"
  | "LLM_MODEL_UNAVAILABLE"
  | "LLM_GENERIC"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export interface UserFacingError {
  code: UserErrorCode;
  /** Texto corto para badges e indicadores. */
  title: string;
  /** Explicación clara para banners y tooltips. */
  message: string;
}

const HTTP_MESSAGES: Record<
  number,
  { code: UserErrorCode; title: string; message: string }
> = {
  400: {
    code: "PULSO_BAD_REQUEST",
    title: "Consulta incorrecta",
    message:
      "La consulta al ERP no es válida. Puede faltar el nombre del procedimiento o algún parámetro.",
  },
  401: {
    code: "PULSO_UNAUTHORIZED",
    title: "Sin acceso al ERP",
    message:
      "Tu sesión no es válida para la API de datos (isg-api-pulso). " +
      "El administrador debe alinear la configuración JWT entre el login y la API Pulso.",
  },
  403: {
    code: "PULSO_FORBIDDEN",
    title: "Acceso denegado",
    message: "No tenés permiso para ejecutar esa consulta en el ERP.",
  },
  404: {
    code: "PULSO_NOT_FOUND",
    title: "No encontrado",
    message: "El servicio o procedimiento solicitado no existe en el ERP.",
  },
  408: {
    code: "TIMEOUT",
    title: "Tiempo agotado",
    message: "La consulta tardó demasiado. Intentá de nuevo en unos segundos.",
  },
  429: {
    code: "LLM_QUOTA",
    title: "Límite de uso",
    message:
      "Se alcanzó el límite de consultas del modelo IA. Esperá un minuto o usá otro modelo en Configuración IA.",
  },
  500: {
    code: "PULSO_SERVER_ERROR",
    title: "Error del ERP",
    message:
      "El servidor de datos (isg-api-pulso) respondió con un error interno. Revisá que la API y SQL Server estén activos.",
  },
  502: {
    code: "PULSO_UNREACHABLE",
    title: "ERP no disponible",
    message: "No se pudo conectar con el servidor de datos. Verificá que isg-api-pulso esté en ejecución.",
  },
  503: {
    code: "PULSO_UNREACHABLE",
    title: "ERP no disponible",
    message: "El servicio de datos no está disponible en este momento. Intentá más tarde.",
  },
  504: {
    code: "PULSO_TIMEOUT",
    title: "ERP lento",
    message: "El servidor de datos no respondió a tiempo. Intentá de nuevo.",
  },
};

/** Traduce un código HTTP según el contexto (pulso, auth, chat). */
export function translateHttpStatus(
  status: number,
  context: "pulso" | "auth" | "chat" | "generic" = "generic",
): UserFacingError {
  const base = HTTP_MESSAGES[status];

  if (context === "auth" && status === 401) {
    return {
      code: "AUTH_UNAUTHORIZED",
      title: "Sesión inválida",
      message: "Tu sesión expiró o no es válida. Volvé a iniciar sesión.",
    };
  }

  if (context === "pulso" && status === 401) {
    return HTTP_MESSAGES[401];
  }

  if (base) {
    return { code: base.code, title: base.title, message: base.message };
  }

  return {
    code: "UNKNOWN",
    title: `Error ${status}`,
    message: `Ocurrió un error inesperado (código ${status}). Contactá al administrador si persiste.`,
  };
}

/** Traduce errores de isg-api-pulso ({ error, detalle }) + status HTTP. */
export function translatePulsoApiError(status: number, data: unknown): UserFacingError {
  const base = translateHttpStatus(status, "pulso");

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const detalle = String(obj.detalle ?? obj.detail ?? "").trim();
    const error = String(obj.error ?? obj.message ?? "").trim();

    if (detalle && status >= 500) {
      return {
        ...base,
        message: `${base.message} Detalle técnico: ${detalle}`,
      };
    }

    if (error.includes("no está autorizado") || error.includes("SecurityException")) {
      return {
        code: "PULSO_FORBIDDEN",
        title: "Procedimiento no permitido",
        message:
          "Ese procedimiento almacenado no está autorizado. Solo se permiten los que empiezan con sp_ISG_Vision_.",
      };
    }

    if (error.includes("nombreSp") || error.includes("NombreSp") || error.includes("Petición inválida")) {
      return translateHttpStatus(400, "pulso");
    }

    if (
      /too many arguments|expects parameter|has too many|argumentos/i.test(
        `${error} ${detalle}`,
      )
    ) {
      return {
        code: "PULSO_BAD_REQUEST",
        title: "Consulta incorrecta",
        message:
          "La consulta al ERP no pudo armarse bien. El asistente debería reintentar con los datos correctos; si persiste, reformulá la pregunta.",
      };
    }
  }

  return base;
}

import {
  buildQuotaExceededMessage,
  getGeminiQuotaKind,
  isRateLimitError,
  unwrapLlmError,
} from "@/lib/llm/llmErrors";

/** Mensaje de cuota LLM según tipo (diaria vs por minuto). */
export function translateLlmQuotaError(error?: unknown): UserFacingError {
  const kind = error ? getGeminiQuotaKind(error) : "unknown";

  if (kind === "daily") {
    return {
      code: "LLM_QUOTA",
      title: "Cuota diaria agotada",
      message: buildQuotaExceededMessage(error),
    };
  }

  if (kind === "minute") {
    return {
      code: "LLM_QUOTA",
      title: "Demasiadas consultas",
      message:
        "Límite de consultas por minuto alcanzado en el modelo gratuito. Esperá 1 minuto e intentá de nuevo, o elegí otro modelo.",
    };
  }

  return {
    code: "LLM_QUOTA",
    title: "Límite de uso",
    message: buildQuotaExceededMessage(error).replace(/\*\*/g, ""),
  };
}

/** Traduce mensajes crudos de red, LLM o ERP a lenguaje simple. */
export function translateErrorMessage(
  raw: string,
  context: "chat" | "pulso" | "llm" | "auth" | "generic" = "generic",
): UserFacingError {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      code: "UNKNOWN",
      title: "Error desconocido",
      message: "Ocurrió un error inesperado. Intentá de nuevo.",
    };
  }

  if (/401|no autorizado|unauthorized|token inválido|expirado/i.test(text)) {
    return context === "auth" || /sesión|token|login/i.test(text)
      ? translateHttpStatus(401, "auth")
      : translateHttpStatus(401, "pulso");
  }

  if (/429|quota|rate limit|resource_exhausted|cuota/i.test(text)) {
    if (/PerDay|GenerateRequestsPerDay|diaria|per day/i.test(text)) {
      return translateLlmQuotaError(text);
    }
    if (/PerMinute|GenerateRequestsPerMinute|por minuto|per minute/i.test(text)) {
      return translateLlmQuotaError(text);
    }
    return translateLlmQuotaError(text);
  }

  if (/503|llm_not_configured|no configurada|openai_api_key/i.test(text)) {
    return {
      code: "LLM_NOT_CONFIGURED",
      title: "IA sin configurar",
      message:
        "No hay modelos de IA disponibles. Configurá GOOGLE_FREE_API_KEY o una API key en Configuración IA.",
    };
  }

  if (/no longer available|not_found|404.*gemini|modelo.*no disponible/i.test(text)) {
    return {
      code: "LLM_MODEL_UNAVAILABLE",
      title: "Modelo no disponible",
      message: "El modelo seleccionado ya no está disponible. Elegí otro en el selector de modelos.",
    };
  }

  if (/fetch failed|econnrefused|network|failed to fetch|enotfound/i.test(lower)) {
    return {
      code: "PULSO_UNREACHABLE",
      title: "Sin conexión al ERP",
      message:
        "No se pudo conectar con isg-api-pulso. Verificá que la API esté levantada y la URL en .env.",
    };
  }

  if (/timeout|timed out|aborted/i.test(lower)) {
    return {
      code: "PULSO_TIMEOUT",
      title: "Consulta lenta",
      message: "La consulta al ERP tardó demasiado. Intentá de nuevo.",
    };
  }

  if (/pulso_api_url|next_public_pulso/i.test(lower)) {
    return {
      code: "PULSO_NOT_CONFIGURED",
      title: "ERP no configurado",
      message: "Falta configurar NEXT_PUBLIC_PULSO_API_URL en el servidor.",
    };
  }

  if (context === "llm" || /gemini|openai|anthropic|groq|modelo ia/i.test(lower)) {
    return {
      code: "LLM_GENERIC",
      title: "Error del modelo IA",
      message: text.length > 180 ? `${text.slice(0, 180)}…` : text,
    };
  }

  if (context === "pulso" || /isg-api-pulso|stored procedure|sp_isg_vision/i.test(lower)) {
    return {
      code: "PULSO_SERVER_ERROR",
      title: "Error al consultar ERP",
      message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    };
  }

  return {
    code: "UNKNOWN",
    title: "Algo salió mal",
    message: text.length > 220 ? `${text.slice(0, 220)}…` : text,
  };
}

/** Traduce cualquier error (Error, string, objeto) a mensaje amigable. */
export function translateUnknownError(
  error: unknown,
  context: "chat" | "pulso" | "llm" | "auth" | "generic" = "generic",
): UserFacingError {
  if (typeof error === "string") {
    return translateErrorMessage(error, context === "auth" ? "generic" : context);
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return translateHttpStatus(504, "pulso");
    }
    if (context === "llm" || context === "chat") {
      if (isRateLimitError(error)) {
        return translateLlmQuotaError(unwrapLlmError(error));
      }
    }
    return translateErrorMessage(error.message, context === "auth" ? "generic" : context);
  }

  return {
    code: "UNKNOWN",
    title: "Error inesperado",
    message: "Ocurrió un error inesperado. Intentá de nuevo.",
  };
}

/** Atajo: solo el mensaje largo para banners. */
export function toUserMessage(error: unknown, context?: Parameters<typeof translateUnknownError>[1]): string {
  return translateUnknownError(error, context).message;
}

/** Atajo: solo el título corto para indicadores. */
export function toUserTitle(error: unknown, context?: Parameters<typeof translateUnknownError>[1]): string {
  return translateUnknownError(error, context).title;
}
