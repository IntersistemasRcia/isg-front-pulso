import type { ComercialRow } from "@/lib/comercial/query";

const money = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const count = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function pickField(row: ComercialRow | null | undefined, name: string): unknown {
  if (!row) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value: unknown): string {
  const amount = asNumber(value);
  if (amount == null) return "—";
  return `$ ${money.format(Math.round(amount))}`;
}

export function formatCount(value: unknown): string {
  const amount = asNumber(value);
  if (amount == null) return "—";
  return count.format(Math.round(amount));
}

export function formatPercent(value: unknown): string {
  const amount = asNumber(value);
  if (amount == null) return "—";
  const points = Math.abs(amount) <= 1.5 ? amount * 100 : amount;
  return `${percent.format(points)} %`;
}

export type KpiCard = {
  id: string;
  label: string;
  value: string;
};

export function mapVentasKpis(row: ComercialRow | null): KpiCard[] {
  return [
    { id: "netas", label: "Ventas Netas", value: formatMoney(pickField(row, "VentasNetas")) },
    { id: "totales", label: "Ventas Totales", value: formatMoney(pickField(row, "TotalFacturado")) },
    { id: "comprobantes", label: "Comprobantes", value: formatCount(pickField(row, "CantComprobantes")) },
    { id: "unidades", label: "Unidades Vendidas", value: formatCount(pickField(row, "UnidadesVendidas")) },
    { id: "ticket", label: "Ticket Promedio", value: formatMoney(pickField(row, "TicketComercial")) },
    { id: "margen", label: "Margen Bruto", value: formatPercent(pickField(row, "MargenPorcentaje")) },
  ];
}

export type MedioPagoItem = {
  medio: string;
  importe: number;
  participacion: number;
};

export function mapMediosPago(rows: ComercialRow[]): MedioPagoItem[] {
  return rows.slice(0, 5).map((row, index) => ({
    medio: String(pickField(row, "MedioPago") ?? `Medio ${index + 1}`),
    importe: asNumber(pickField(row, "Importe")) ?? 0,
    participacion: asNumber(pickField(row, "Participacion")) ?? 0,
  }));
}

export type SucursalItem = {
  sucursal: string;
  importe: number;
  participacion: number;
};

export function mapSucursales(rows: ComercialRow[]): SucursalItem[] {
  return rows.map((row, index) => ({
    sucursal: String(
      pickField(row, "Sucursal") ??
        pickField(row, "Descripcion") ??
        pickField(row, "DESCRIPCION") ??
        `Sucursal ${index + 1}`,
    ),
    importe: asNumber(pickField(row, "VentasTotales")) ?? 0,
    participacion: asNumber(pickField(row, "ParticipacionPct")) ?? 0,
  }));
}

export function mapRubros(rows: ComercialRow[]): SucursalItem[] {
  return [...rows]
    .sort((a, b) => (asNumber(pickField(b, "VentaNeta")) ?? 0) - (asNumber(pickField(a, "VentaNeta")) ?? 0))
    .slice(0, 5)
    .map((row, index) => ({
      sucursal: String(
        pickField(row, "Rubro") ??
          pickField(row, "Descripcion") ??
          pickField(row, "DESCRIPCION") ??
          `Rubro ${index + 1}`,
      ),
      importe: asNumber(pickField(row, "VentaNeta")) ?? 0,
      participacion: asNumber(pickField(row, "ParticipacionPct")) ?? 0,
    }));
}
