/** Extrae ejecuciones de ejecutarConsultaPulso desde partes UIMessage (debug). */
export type PulsoToolExecDebug = {
  nombreSp: string;
  ok: boolean | null;
  code?: string;
  missingRequired?: string[];
  message?: string;
  state: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Lista todas las llamadas a ejecutarConsultaPulso de un mensaje (orden del turno). */
export function extractToolExecutionsFromParts(
  parts: unknown[] | undefined,
): PulsoToolExecDebug[] {
  if (!parts?.length) return [];
  const out: PulsoToolExecDebug[] = [];

  for (const raw of parts) {
    if (!isRecord(raw) || typeof raw.type !== "string") continue;
    const type = raw.type;
    const isEjecutar =
      type === "tool-ejecutarConsultaPulso" ||
      (type === "dynamic-tool" &&
        typeof raw.toolName === "string" &&
        raw.toolName === "ejecutarConsultaPulso");
    if (!isEjecutar) continue;

    const state = typeof raw.state === "string" ? raw.state : "unknown";
    const input = isRecord(raw.input) ? raw.input : {};
    const nombreFromInput = String(input.nombreSp ?? "").trim();

    if (state === "output-error") {
      out.push({
        nombreSp: nombreFromInput || "(desconocido)",
        ok: false,
        message: typeof raw.errorText === "string" ? raw.errorText : undefined,
        state,
      });
      continue;
    }

    if (state === "output-available" && isRecord(raw.output)) {
      const output = raw.output;
      const missing = Array.isArray(output.missingRequired)
        ? output.missingRequired.map(String)
        : undefined;
      out.push({
        nombreSp: String(output.nombreSp ?? nombreFromInput || "(desconocido)"),
        ok: output.ok !== false,
        code: typeof output.code === "string" ? output.code : undefined,
        missingRequired: missing,
        message: typeof output.message === "string" ? output.message : undefined,
        state,
      });
      continue;
    }

    out.push({
      nombreSp: nombreFromInput || "(pendiente)",
      ok: null,
      state,
    });
  }

  return out;
}
