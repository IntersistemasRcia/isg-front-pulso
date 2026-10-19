import {
  formatCount,
  formatMoney,
  pickField,
  asNumber,
  type KpiDelta,
} from "@/lib/comercial/present";
import type { CrmRow } from "@/lib/crm/query";

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const moneyFull = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NO_PREVIOUS = "sin datos de periodos anteriores";

export type CrmKpi = {
  id: string;
  label: string;
  value: string;
  /** Pie secundario (ej. cantidad de pedidos). */
  detail: string | null;
  delta: KpiDelta | null;
  tone: "total" | "facturada" | "pedidos" | "clientes";
};

function toneOf(delta: number): KpiDelta["tone"] {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function formatSigned(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${percent.format(Math.abs(delta))} %`;
}

function ratioDelta(current: unknown, previous: unknown): KpiDelta | null {
  const actual = asNumber(current);
  const base = asNumber(previous);
  if (actual == null || base == null || base === 0) return null;
  const delta = ((actual - base) / Math.abs(base)) * 100;
  return { text: formatSigned(delta), tone: toneOf(delta) };
}

export function mapResumenKpis(row: CrmRow | null, previous: CrmRow | null = null): CrmKpi[] {
  const comparable = previous != null;
  const delta = (field: string) => {
    if (!comparable) return null;
    return ratioDelta(pickField(row, field), pickField(previous, field));
  };
  const pedidos = formatCount(pickField(row, "CantidadPedidos"));

  return [
    {
      id: "total",
      label: "Venta comercial total",
      value: formatMoney(pickField(row, "VentaComercialTotal")),
      detail: null,
      delta: delta("VentaComercialTotal"),
      tone: "total",
    },
    {
      id: "facturada",
      label: "Venta facturada neta",
      value: formatMoney(pickField(row, "VentaConComprobante")),
      detail: null,
      delta: delta("VentaConComprobante"),
      tone: "facturada",
    },
    {
      id: "pedidos",
      label: "Pedidos en cuenta del cliente",
      value: formatMoney(pickField(row, "VentaSinComprobante")),
      detail: pedidos === "—" ? null : `${pedidos} pedidos`,
      delta: delta("VentaSinComprobante"),
      tone: "pedidos",
    },
    {
      id: "clientes",
      label: "Clientes con operación",
      value: formatCount(pickField(row, "ClientesConOperacion")),
      detail: null,
      delta: delta("ClientesConOperacion"),
      tone: "clientes",
    },
  ];
}

export { NO_PREVIOUS };

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
  return mapImporteBarras(rows, "Zona", "Zona");
}

export function mapClasificaciones(rows: CrmRow[]): ZonaItem[] {
  return mapImporteBarras(rows, "ClasificacionCliente", "Clasificación");
}

export function mapCondicionesIva(rows: CrmRow[]): ZonaItem[] {
  return mapImporteBarras(rows, "CondicionIVA", "Condición");
}

function mapImporteBarras(rows: CrmRow[], labelField: string, fallback: string): ZonaItem[] {
  return rows.map((row, index) => ({
    zona: String(pickField(row, labelField) ?? pickField(row, "Descripcion") ?? `${fallback} ${index + 1}`),
    importe: asNumber(pickField(row, "VentaComercialTotal")) ?? 0,
  }));
}

export type OperacionEstado = "Facturada" | "En cuenta";

export type OperacionItem = {
  id: string;
  fecha: string;
  tipo: string;
  numeroPedidoErp: string;
  comprobante: string;
  cliente: string;
  vendedor: string;
  zona: string;
  monto: string;
  estado: OperacionEstado;
};

/** Formato dinero completo para tablas de detalle (sin K/M). */
export function formatMoneyFull(value: unknown): string {
  const amount = asNumber(value);
  if (amount == null) return "—";
  return `$ ${moneyFull.format(amount)}`;
}

export function mapOperaciones(rows: CrmRow[]): OperacionItem[] {
  return rows.map((row, index) => {
    const esFacturada = asNumber(pickField(row, "EsFacturada"));
    const estado: OperacionEstado = esFacturada === 1 ? "Facturada" : "En cuenta";
    const numero = String(pickField(row, "NumeroPedidoERP") ?? "").trim() || "—";
    return {
      id: `${numero}-${index}`,
      fecha: formatFechaPedido(pickField(row, "FechaPedido")),
      tipo: String(pickField(row, "ClaseMovimiento") ?? "—").trim() || "—",
      numeroPedidoErp: numero,
      comprobante: "—",
      cliente: String(pickField(row, "Cliente") ?? "—").trim() || "—",
      vendedor: String(pickField(row, "Vendedor") ?? "—").trim() || "—",
      zona: String(pickField(row, "Zona") ?? "—").trim() || "—",
      monto: formatMoneyFull(pickField(row, "Total")),
      estado,
    };
  });
}

function formatFechaPedido(value: unknown): string {
  if (value == null) return "—";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  const text = String(value).trim();
  if (!text) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(text);
  if (iso) {
    const time = iso[4] && iso[5] ? ` ${iso[4]}:${iso[5]}` : "";
    return `${iso[3]}/${iso[2]}/${iso[1]}${time}`;
  }
  return text;
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
