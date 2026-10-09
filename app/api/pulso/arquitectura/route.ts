import { NextRequest, NextResponse } from "next/server";
import { getPulsoApiBaseUrl } from "@/lib/pulso/config";
import { getSpsArquitecturaCached } from "@/lib/pulso/catalog";
import { toStoredArquitectura } from "@/lib/pulso/arquitecturaStorage";
import { PulsoApiError } from "@/lib/pulso/client";
import { translateHttpStatus, translateUnknownError } from "@/utils/userFacingErrors";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

/**
 * GET /api/pulso/arquitectura
 * Proxy de isg-api-pulso GET /SPs_arquitectura para cache en localStorage del cliente.
 * Query `?refresh=1` fuerza refetch (sin cache de 5 min en Next).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) {
    const err = translateHttpStatus(401, "auth");
    return NextResponse.json({ message: err.message }, { status: 401 });
  }

  if (!getPulsoApiBaseUrl()) {
    const err = translateUnknownError("NEXT_PUBLIC_PULSO_API_URL no configurada", "pulso");
    return NextResponse.json({ message: err.message }, { status: 503 });
  }

  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const catalog = await getSpsArquitecturaCached(auth.token, { force });
    return NextResponse.json(toStoredArquitectura(catalog));
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
