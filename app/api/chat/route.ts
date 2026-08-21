import { NextRequest } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import {
  extractBearerToken,
  mapPayloadToUser,
  verifyAuthToken,
} from "@/utils/auth";
import { SP_TOOLS_CATALOG } from "@/utils/spCatalog";
import { AUTH_COOKIE_NAME } from "@/utils/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Ejecuta un SP en el agente local .NET del cliente. */
async function executeLocalSp(
  spName: string,
  parameters: Record<string, unknown>,
  clienteId: string,
): Promise<unknown> {
  const agentUrl = process.env.LOCAL_AGENT_URL;
  const apiKey = process.env.LOCAL_AGENT_API_KEY;

  if (!agentUrl) {
    return {
      ok: false,
      message:
        "LOCAL_AGENT_URL no configurada. El orquestador no puede despachar el SP.",
      spName,
      parameters,
      note: "Consultando base de datos... (agente no disponible)",
    };
  }

  const response = await fetch(`${agentUrl.replace(/\/$/, "")}/api/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey ?? "",
    },
    body: JSON.stringify({
      spName,
      parameters,
      clienteId,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: "Error al ejecutar SP en el agente local",
      data,
    };
  }

  return data;
}

function buildDynamicTools(clienteId: string) {
  // ToolSet dinámico a partir del catálogo de SPs (schemas abiertos).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  for (const sp of SP_TOOLS_CATALOG) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, def] of Object.entries(sp.parameters.properties)) {
      if (def.type === "number") shape[key] = z.number().optional();
      else if (def.type === "boolean") shape[key] = z.boolean().optional();
      else shape[key] = z.string().optional();
    }

    tools[sp.name] = tool({
      description: sp.description,
      inputSchema: z.object(shape),
      execute: async (params) =>
        executeLocalSp(sp.name, params as Record<string, unknown>, clienteId),
    });
  }

  return tools;
}

/**
 * Orquestador de chat: valida JWT, consulta OpenAI con function calling
 * y despacha SPs al agente local del cliente.
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

  if (!process.env.JWT_SECRET) {
    return new Response(
      JSON.stringify({ message: "JWT_SECRET no configurado en el servidor" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
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
  const messages = body.messages ?? [];
  const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const tools = buildDynamicTools(user.clienteId);

  const result = streamText({
    model: openai(modelId),
    system: [
      "Sos un asistente de negocio (Pulso ISG) que responde en español rioplatense.",
      "Usás las tools (stored procedures) para obtener datos reales del ERP del cliente.",
      `ClienteId del usuario autenticado: ${user.clienteId || "N/D"}.`,
      "Cuando obtengas datos tabulares, presentalos en Markdown con tablas claras.",
      "Si falta un parámetro, pedilo antes de inventar valores.",
      "Antes de llamar a una tool, el usuario verá el estado 'Consultando base de datos...'.",
    ].join(" "),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
