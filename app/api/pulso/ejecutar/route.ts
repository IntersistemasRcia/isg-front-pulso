import { NextRequest, NextResponse } from "next/server";
import { getPulsoApiBaseUrl } from "@/lib/pulso/config";
import { ejecutarSpPulso, PulsoApiError } from "@/lib/pulso/client";
import { translateHttpStatus, translateUnknownError } from "@/utils/userFacingErrors";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

const SP_PREFIX = "sp_ISG_Vision_";

/**
 * POST /api/pulso/ejecutar
 * Proxy de isg-api-pulso POST /ejecutar-sp para el módulo Comercial.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    const err = translateHttpStatus(401, "auth");
    return NextResponse.json({ message: err.message }, { status: 401 });
  }

  if (!getPulsoApiBaseUrl()) {
    const err = translateUnknownError("NEXT_PUBLIC_PULSO_API_URL no configurada", "pulso");
    return NextResponse.json({ message: err.message }, { status: 503 });
  }

  let body: { nombreSp?: unknown; parametros?: unknown; limiteFilas?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "El cuerpo de la consulta no es válido." }, { status: 400 });
  }

  const nombreSp = String(body.nombreSp ?? "").trim();
  if (!nombreSp.startsWith(SP_PREFIX)) {
    return NextResponse.json(
      { message: "Solo se pueden ejecutar procedimientos de la suite Vision." },
      { status: 400 },
    );
  }

  const parametros =
    body.parametros && typeof body.parametros === "object" && !Array.isArray(body.parametros)
      ? (body.parametros as Record<string, unknown>)
      : {};

  const limiteFilas =
    typeof body.limiteFilas === "number" && Number.isFinite(body.limiteFilas)
      ? body.limiteFilas
      : undefined;

  try {
    const result = await ejecutarSpPulso(
      { nombreSp, parametros, limiteFilas },
      { sessionToken: auth.token },
    );
    const status = result.ok === false ? result.status ?? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof PulsoApiError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    const err = translateUnknownError(error, "pulso");
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
