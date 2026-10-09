import { authFetch } from "@/utils/api";
import { formatPulsoDay, type DateRange } from "@/lib/comercial/period";

export type CrmRow = Record<string, unknown>;

export type CrmEstado = "TODOS" | "CON" | "SIN";

export type CrmFilters = {
  range: DateRange;
  estado: CrmEstado;
  codigoZona: number | null;
  codigoVendedor: number | null;
};

export type CatalogOption = {
  id: number;
  label: string;
};

const RESUMEN = "sp_ISG_CRM_Visual_ResumenComercial";
const EVOLUCION = "sp_ISG_CRM_Visual_Ventas_Evolucion";
const POR_ZONA = "sp_ISG_CRM_Visual_Ventas_PorZona";
const CATALOGO_ZONAS = "sp_ISG_Vision_Catalogo_Zonas";
const CATALOGO_VENDEDORES = "sp_ISG_Vision_Catalogo_Vendedores";

async function ejecutarSp(
  nombreSp: string,
  parametros: Record<string, unknown>,
  token: string,
  signal?: AbortSignal,
): Promise<CrmRow[]> {
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

  if (Array.isArray(payload?.rows)) return payload.rows as CrmRow[];
  if (Array.isArray(payload?.data)) return payload.data as CrmRow[];
  return [];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo consultar el indicador.";
}

export function crmParametros(filters: CrmFilters): Record<string, unknown> {
  const parametros: Record<string, unknown> = {
    FechaDesde: formatPulsoDay(filters.range.desde),
    FechaCorte: formatPulsoDay(filters.range.hasta),
    EstadoFacturacion: filters.estado,
  };
  if (filters.codigoZona != null) parametros.CodigoZona = filters.codigoZona;
  if (filters.codigoVendedor != null) parametros.CodigoVendedor = filters.codigoVendedor;
  return parametros;
}

export type CrmSnapshot = {
  resumen: CrmRow | null;
  evolucion: CrmRow[];
  zonas: CrmRow[];
  errors: {
    resumen?: string;
    evolucion?: string;
    zonas?: string;
  };
};

export async function loadCrm(
  filters: CrmFilters,
  token: string,
  signal?: AbortSignal,
): Promise<CrmSnapshot> {
  const parametros = crmParametros(filters);
  const [resumenResult, evolucionResult, zonasResult] = await Promise.allSettled([
    ejecutarSp(RESUMEN, parametros, token, signal),
    ejecutarSp(EVOLUCION, parametros, token, signal),
    ejecutarSp(POR_ZONA, parametros, token, signal),
  ]);

  return {
    resumen: resumenResult.status === "fulfilled" ? resumenResult.value[0] ?? null : null,
    evolucion: evolucionResult.status === "fulfilled" ? evolucionResult.value : [],
    zonas: zonasResult.status === "fulfilled" ? zonasResult.value : [],
    errors: {
      ...(resumenResult.status === "rejected" ? { resumen: messageOf(resumenResult.reason) } : {}),
      ...(evolucionResult.status === "rejected" ? { evolucion: messageOf(evolucionResult.reason) } : {}),
      ...(zonasResult.status === "rejected" ? { zonas: messageOf(zonasResult.reason) } : {}),
    },
  };
}

export type CrmCatalogs = {
  zonas: CatalogOption[];
  vendedores: CatalogOption[];
  errors: {
    zonas?: string;
    vendedores?: string;
  };
};

export async function loadCrmCatalogs(token: string, signal?: AbortSignal): Promise<CrmCatalogs> {
  const [zonasResult, vendedoresResult] = await Promise.allSettled([
    ejecutarSp(CATALOGO_ZONAS, {}, token, signal),
    ejecutarSp(CATALOGO_VENDEDORES, {}, token, signal),
  ]);

  return {
    zonas: zonasResult.status === "fulfilled" ? mapCatalog(zonasResult.value, "IDZona", "Descripcion") : [],
    vendedores:
      vendedoresResult.status === "fulfilled"
        ? mapCatalog(vendedoresResult.value, "IDVendedor", "Nombre")
        : [],
    errors: {
      ...(zonasResult.status === "rejected" ? { zonas: messageOf(zonasResult.reason) } : {}),
      ...(vendedoresResult.status === "rejected" ? { vendedores: messageOf(vendedoresResult.reason) } : {}),
    },
  };
}

function mapCatalog(rows: CrmRow[], idField: string, labelField: string): CatalogOption[] {
  const options: CatalogOption[] = [];
  for (const row of rows) {
    const id = asCatalogId(pick(row, idField));
    const label = pick(row, labelField);
    if (id == null || label == null || String(label).trim() === "") continue;
    options.push({ id, label: String(label) });
  }
  options.sort((a, b) => a.label.localeCompare(b.label, "es"));
  return options;
}

function pick(row: CrmRow, name: string): unknown {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function asCatalogId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
