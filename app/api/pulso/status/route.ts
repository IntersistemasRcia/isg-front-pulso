import { NextRequest, NextResponse } from "next/server";
import { getPulsoApiBaseUrl } from "@/lib/pulso/config";
import { fetchSpsArquitectura, PulsoApiError } from "@/lib/pulso/client";
import { translateHttpStatus, translateUnknownError } from "@/utils/userFacingErrors";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

export type PulsoStatusResponse =
  | {
      status: "ok";
      spCount: number;
      title: string;
      message: string;
    }
  | {
      status: "checking";
      title: string;
      message: string;
    }
  | {
      status: "error";
      code: string;
      httpStatus?: number;
      title: string;
      message: string;
    };

/** GET /api/pulso/status — health check de isg-api-pulso con el JWT del usuario. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    const err = translateHttpStatus(401, "auth");
    return NextResponse.json(
      {
        status: "error",
        code: err.code,
        httpStatus: 401,
        title: err.title,
        message: err.message,
      } satisfies PulsoStatusResponse,
      { status: 200 },
    );
  }

  if (!getPulsoApiBaseUrl()) {
    const err = translateUnknownError("NEXT_PUBLIC_PULSO_API_URL no configurada", "pulso");
    return NextResponse.json({
      status: "error",
      code: err.code,
      title: err.title,
      message: err.message,
    } satisfies PulsoStatusResponse);
  }

  try {
    const catalog = await fetchSpsArquitectura({
      sessionToken: auth.token,
      signal: AbortSignal.timeout(10_000),
    });

    const count = catalog.length;
    return NextResponse.json({
      status: "ok",
      spCount: count,
      title: count > 0 ? "ERP conectado" : "ERP sin procedimientos",
      message:
        count > 0
          ? `${count} procedimiento${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"} para consultas.`
          : "La API responde pero no hay SPs sp_ISG_Vision_ en la base de datos.",
    } satisfies PulsoStatusResponse);
  } catch (error) {
    if (error instanceof PulsoApiError) {
      return NextResponse.json({
        status: "error",
        code: error.code,
        httpStatus: error.httpStatus,
        title: error.title,
        message: error.message,
      } satisfies PulsoStatusResponse);
    }

    const translated = translateUnknownError(error, "pulso");
    return NextResponse.json({
      status: "error",
      code: translated.code,
      title: translated.title,
      message: translated.message,
    } satisfies PulsoStatusResponse);
  }
}
