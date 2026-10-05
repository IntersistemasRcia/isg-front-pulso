import { authFetch } from "@/utils/api";
import { formatPulsoDay, type DateRange } from "@/lib/comercial/period";

export type ComercialRow = Record<string, unknown>;

const VENTAS_DIARIAS = "sp_ISG_Vision_VentasDiarias";
const MEDIOS_PAGO = "sp_ISG_Vision_dash_ventas_medio_pago_resumen";
const POR_SUCURSAL = "sp_ISG_Vision_dash_ventas_por_sucursal";
const POR_RUBRO = "sp_ISG_Vision_ventas_por_rubro_margen";

async function ejecutarSp(
  nombreSp: string,
  parametros: Record<string, unknown>,
  token: string,
  signal?: AbortSignal,
): Promise<ComercialRow[]> {
  const response = await authFetch("/api/pulso/ejecutar", {
    method: "POST",
    token,
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombreSp, parametros }),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    rows?: unknown;
    data?: unknown;
  } | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || "No se pudo consultar el indicador.");
  }

  if (Array.isArray(payload?.rows)) return payload.rows as ComercialRow[];
  if (Array.isArray(payload?.data)) return payload.data as ComercialRow[];
  return [];
}

export type ComercialSnapshot = {
  ventas: ComercialRow | null;
  medios: ComercialRow[];
  sucursales: ComercialRow[];
  rubros: ComercialRow[];
  errors: {
    ventas?: string;
    medios?: string;
    sucursales?: string;
    rubros?: string;
  };
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo consultar el indicador.";
}

export async function loadComercial(
  range: DateRange,
  token: string,
  signal?: AbortSignal,
): Promise<ComercialSnapshot> {
  const diario = {
    DesdeFecha: formatPulsoDay(range.desde),
    HastaFecha: formatPulsoDay(range.hasta),
  };
  const dash = {
    FechaDesde: formatPulsoDay(range.desde),
    FechaHasta: formatPulsoDay(range.hasta),
  };
  const rubro = {
    ...dash,
    ModoOrden: "VENTA_DESC",
    Top: 5,
  };

  const [ventasResult, mediosResult, sucursalesResult, rubrosResult] = await Promise.allSettled([
    ejecutarSp(VENTAS_DIARIAS, diario, token, signal),
    ejecutarSp(MEDIOS_PAGO, dash, token, signal),
    ejecutarSp(POR_SUCURSAL, dash, token, signal),
    ejecutarSp(POR_RUBRO, rubro, token, signal),
  ]);

  return {
    ventas: ventasResult.status === "fulfilled" ? ventasResult.value[0] ?? null : null,
    medios: mediosResult.status === "fulfilled" ? mediosResult.value : [],
    sucursales: sucursalesResult.status === "fulfilled" ? sucursalesResult.value : [],
    rubros: rubrosResult.status === "fulfilled" ? rubrosResult.value : [],
    errors: {
      ...(ventasResult.status === "rejected" ? { ventas: messageOf(ventasResult.reason) } : {}),
      ...(mediosResult.status === "rejected" ? { medios: messageOf(mediosResult.reason) } : {}),
      ...(sucursalesResult.status === "rejected" ? { sucursales: messageOf(sucursalesResult.reason) } : {}),
      ...(rubrosResult.status === "rejected" ? { rubros: messageOf(rubrosResult.reason) } : {}),
    },
  };
}
