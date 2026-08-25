/** Ejecuta un SP en el agente local .NET del cliente. */
export async function executeLocalSp(
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
