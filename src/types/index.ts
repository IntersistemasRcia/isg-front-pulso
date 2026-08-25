/** Identidad del usuario autenticado extraída del JWT / perfil. */
export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  /** Identificador del cliente on-premise asociado al token. */
  clienteId: string;
  /** Nombre de empresa / sucursal para el header del dashboard. */
  companyName: string;
  roles?: string[];
}

/** Credenciales del formulario de login. */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** Respuesta esperada de la API Auth existente. */
export interface LoginResponse {
  token: string;
  /** ISO / offset datetime (mapeado desde `validTo` de Auth). */
  expiresAt?: string;
  user?: Partial<User>;
}

/** Roles de mensaje en el chat. */
export type MessageRole = "user" | "assistant" | "system";

/** Mensaje de conversación. */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

/** Estado de carga del chat visible al usuario. */
export type ChatStatus = "idle" | "submitted" | "streaming" | "error";

/** Payload enviado a POST /api/chat. */
export interface ChatRequestBody {
  messages: Array<{
    role: MessageRole;
    content: string;
  }>;
}

/** Entrada del catálogo de Stored Procedures expuestos a function calling. */
export interface StoredProcedureTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
      }
    >;
    required?: string[];
  };
}

/** Orden reenviada al agente local .NET. */
export interface LocalAgentRequest {
  spName: string;
  parameters: Record<string, unknown>;
  clienteId: string;
}

/** Payload decodificado del JWT de API_Auth. */
export interface JwtPayload {
  sub: string;
  name?: string;
  email?: string;
  clienteId?: string;
  ClienteId?: string;
  companyName?: string;
  CompanyName?: string;
  unique_name?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}
