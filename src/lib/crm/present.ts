import { formatCount, formatMoney, pickField, asNumber } from "@/lib/comercial/present";
import type { CrmRow } from "@/lib/crm/query";

export type CrmKpi = {
  id: string;
  label: string;
  value: string;
  foot: string | null;
  tone: "total" | "facturada" | "pedidos" | "clientes";
};

export function mapResumenKpis(row: CrmRow | null): CrmKpi[] {
  const pedidos = formatCount(pickField(row, "CantidadPedidos"));
  return [
    {
      id: "total",
      label: "Venta comercial total",
      value: formatMoney(pickField(row, "VentaComercialTotal")),
      foot: null,
      tone: "total",
    },
    {
      id: "facturada",
      label: "Venta facturada neta",
      value: formatMoney(pickField(row, "VentaConComprobante")),
      foot: null,
      tone: "facturada",
    },
    {
      id: "pedidos",
      label: "Pedidos en cuenta del cliente",
      value: formatMoney(pickField(row, "VentaSinComprobante")),
      foot: pedidos === "—" ? "—" : `${pedidos} pedidos`,
      tone: "pedidos",
    },
    {
      id: "clientes",
      label: "Clientes con operación",
      value: formatCount(pickField(row, "ClientesConOperacion")),
      foot: null,
      tone: "clientes",
    },
  ];
}

export type EvolucionPunto = {
  dia: string;
  orden: number;
  venta: number;
  pedidos: number;
};

export function mapEvolucion(rows: CrmRow[]): EvolucionPunto[] {
  return rows
    .map((row, index) => {
      const raw = pickField(row, "Fecha") ?? pickField(row, "Dia") ?? pickField(row, "FechaPedido");
      const orden = daySortKey(raw) ?? index;
      return {
        dia: formatDayLabel(raw) || `Día ${index + 1}`,
        orden,
        venta: asNumber(pickField(row, "VentaComercialTotal")) ?? 0,
        pedidos: asNumber(pickField(row, "ImportePedidosYDebitosInternos")) ?? 0,
      };
    })
    .sort((a, b) => a.orden - b.orden);
}

export type ZonaItem = {
  zona: string;
  importe: number;
};

export function mapZonas(rows: CrmRow[]): ZonaItem[] {
  return rows.map((row, index) => ({
    zona: String(pickField(row, "Zona") ?? pickField(row, "Descripcion") ?? `Zona ${index + 1}`),
    importe: asNumber(pickField(row, "VentaComercialTotal")) ?? 0,
  }));
}

function formatDayLabel(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}`;
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (dmy) return `${dmy[1]}/${dmy[2]}`;
  return text;
}

function daySortKey(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value !== "string") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (dmy) return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
