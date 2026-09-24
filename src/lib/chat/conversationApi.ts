import type { UIMessage } from "ai";
import { stripToolRowsForTransport } from "@/lib/chat/stripToolRowsForTransport";
import type {
  AppendMensajeInput,
  ConversationDetail,
  ConversationListItem,
  ConversationMessageItem,
} from "@/lib/chat/conversationTypes";
import { getStoredToken } from "@/utils/api";

const BASE = "/api/chat/conversations";

function authHeaders(token?: string | null): HeadersInit {
  const t = token ?? getStoredToken();
  if (!t) return { Accept: "application/json" };
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${t}`,
    "x-pulso-token": t,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNullableString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (v == null) return null;
    if (typeof v === "string") return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return 0;
}

function normalizeListItem(raw: unknown): ConversationListItem | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, "id", "Id");
  const titulo = pickString(obj, "titulo", "Titulo") ?? "Sin título";
  if (!id) return null;
  return {
    id,
    titulo,
    createdDate: pickNullableString(obj, "createdDate", "CreatedDate"),
    lastModifiedDate: pickNullableString(
      obj,
      "lastModifiedDate",
      "LastModifiedDate",
    ),
  };
}

function normalizeMessage(raw: unknown): ConversationMessageItem | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, "id", "Id");
  const role = pickString(obj, "role", "Role") ?? "assistant";
  const partsJson = pickString(obj, "partsJson", "PartsJson") ?? "[]";
  if (!id) return null;
  return {
    id,
    role,
    modelId: pickNullableString(obj, "modelId", "ModelId"),
    partsJson,
    orden: pickNumber(obj, "orden", "Orden"),
    createdDate: pickNullableString(obj, "createdDate", "CreatedDate"),
  };
}

function normalizeDetail(raw: unknown): ConversationDetail | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, "id", "Id");
  const titulo = pickString(obj, "titulo", "Titulo") ?? "Sin título";
  if (!id) return null;
  const mensajesRaw = obj.mensajes ?? obj.Mensajes;
  const mensajes = Array.isArray(mensajesRaw)
    ? mensajesRaw
        .map(normalizeMessage)
        .filter((m): m is ConversationMessageItem => m != null)
        .sort((a, b) => a.orden - b.orden)
    : [];
  return { id, titulo, mensajes };
}

export class ConversationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ConversationApiError";
    this.status = status;
  }
}

async function ensureOk(res: Response, fallback: string): Promise<void> {
  if (res.ok || res.status === 204) return;
  const data = asRecord(await readJson(res));
  const msg =
    (data && pickString(data, "message", "Message", "title", "Title")) ||
    fallback;
  throw new ConversationApiError(msg, res.status);
}

/** Lista conversaciones del usuario (máx. 50 en Auth). */
export async function listConversations(
  token?: string | null,
): Promise<ConversationListItem[]> {
  const res = await fetch(BASE, {
    method: "GET",
    headers: authHeaders(token),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 503) {
    throw new ConversationApiError(
      "AUTH_API_URL no configurada",
      503,
    );
  }
  await ensureOk(res, "No se pudo listar el historial");
  const data = await readJson(res);
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeListItem)
    .filter((x): x is ConversationListItem => x != null);
}

/** Crea conversación; retorna id. */
export async function createConversation(
  titulo: string,
  token?: string | null,
): Promise<string> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: authHeaders(token),
    credentials: "same-origin",
    body: JSON.stringify({ titulo: titulo.trim() || "Nueva consulta" }),
  });
  await ensureOk(res, "No se pudo crear la conversación");
  const data = asRecord(await readJson(res));
  const id = data ? pickString(data, "id", "Id") : null;
  if (!id) throw new ConversationApiError("Respuesta sin id", res.status);
  return id;
}

/** Detalle con mensajes. */
export async function getConversation(
  id: string,
  token?: string | null,
): Promise<ConversationDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(token),
    credentials: "same-origin",
    cache: "no-store",
  });
  await ensureOk(res, "Conversación no encontrada");
  const detail = normalizeDetail(await readJson(res));
  if (!detail) {
    throw new ConversationApiError("Detalle inválido", res.status);
  }
  return detail;
}

/** Soft delete. */
export async function deleteConversation(
  id: string,
  token?: string | null,
): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
    credentials: "same-origin",
  });
  await ensureOk(res, "No se pudo eliminar la conversación");
}

/** Append mensajes (1..N). */
export async function appendMessages(
  conversationId: string,
  mensajes: AppendMensajeInput[],
  token?: string | null,
): Promise<void> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: authHeaders(token),
      credentials: "same-origin",
      body: JSON.stringify({ mensajes }),
    },
  );
  await ensureOk(res, "No se pudo guardar los mensajes");
}

/** Título corto a partir del primer mensaje del usuario. */
export function titleFromUserText(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Nueva consulta";
  return t.length <= 80 ? t : `${t.slice(0, 77)}…`;
}

/** Extrae texto plano de un UIMessage (para título). */
export function extractTextFromUiMessage(message: UIMessage): string {
  const parts = message.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    if (part && typeof part === "object" && "type" in part && part.type === "text") {
      const text = (part as { text?: string }).text;
      if (typeof text === "string" && text.trim()) texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

/** Serializa parts slim para PartsJson. */
export function uiMessageToPartsJson(message: UIMessage): string {
  const [slim] = stripToolRowsForTransport([message]);
  return JSON.stringify(slim?.parts ?? []);
}

/** Reconstruye UIMessage desde fila Auth. */
export function uiMessageFromStored(
  item: ConversationMessageItem,
): UIMessage {
  let parts: UIMessage["parts"] = [];
  try {
    const parsed: unknown = JSON.parse(item.partsJson);
    if (Array.isArray(parsed)) {
      parts = parsed as UIMessage["parts"];
    } else if (typeof parsed === "string") {
      parts = [{ type: "text", text: parsed }];
    } else {
      parts = [{ type: "text", text: item.partsJson }];
    }
  } catch {
    parts = [{ type: "text", text: item.partsJson }];
  }

  const role =
    item.role === "user" || item.role === "assistant" ? item.role : "assistant";

  return {
    id: item.id,
    role,
    parts,
  };
}
