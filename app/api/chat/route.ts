import { NextRequest } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractBearerToken,
  mapPayloadToUser,
  verifyAuthToken,
} from "@/utils/auth";
import { AUTH_COOKIE_NAME } from "@/utils/constants";
import {
  buildTools,
  selectActiveTools,
  windowMessages,
} from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return "";
}

/**
 * Orquestador de chat: valida JWT, selecciona tools relevantes,
 * limita contexto/resultados y despacha SPs al agente local.
 * POST /api/chat
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const token = extractBearerToken(authHeader) ?? cookieToken ?? null;

  if (!token) {
    return new Response(JSON.stringify({ message: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let user;
  try {
    const payload = await verifyAuthToken(token);
    user = mapPayloadToUser(payload);
  } catch {
    return new Response(JSON.stringify({ message: "Token inválido o expirado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ message: "OPENAI_API_KEY no configurada" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await request.json()) as { messages: UIMessage[] };
  const allMessages = body.messages ?? [];
  const { messages, historySummary } = windowMessages(allMessages);

  const userText = extractLastUserText(allMessages);
  const activeCatalog = selectActiveTools(userText);
  const tools = buildTools(activeCatalog, user.clienteId);

  const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const systemParts = [
    "Sos un asistente de negocio (Pulso ISG) que responde en español rioplatense.",
    "Usás las tools (stored procedures) para obtener datos reales del ERP del cliente.",
    `ClienteId del usuario autenticado: ${user.clienteId || "N/D"}.`,
    `Tools activas en este turno: ${activeCatalog.map((t) => t.name).join(", ")}.`,
    "Cuando obtengas datos tabulares, presentalos en Markdown con tablas claras.",
    "Si falta un parámetro, pedilo antes de inventar valores.",
    "Antes de llamar a una tool, el usuario verá el estado 'Consultando base de datos...'.",
  ];

  if (historySummary) {
    systemParts.push(historySummary);
  }

  const result = streamText({
    model: openai(modelId),
    system: systemParts.join(" "),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
