import { NextRequest, NextResponse } from "next/server";
import {
  buildSpreadsheetXml,
  sanitizeDownloadName,
} from "@/lib/chat/buildSpreadsheetXml";
import { getPulsoExcelExport } from "@/lib/pulso/exportStore";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

/**
 * Descarga un Excel generado por la tool (listados grandes / modoResultado=completo).
 * GET /api/pulso/export/:id
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const spec = getPulsoExcelExport(id);
  if (!spec) {
    return NextResponse.json(
      { message: "El archivo expiró o no existe. Volvé a pedir el listado." },
      { status: 404 },
    );
  }

  const xml = buildSpreadsheetXml(spec);
  const filename = sanitizeDownloadName(spec.title);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
