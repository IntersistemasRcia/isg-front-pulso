export type PeriodPreset =
  | "hoy"
  | "ayer"
  | "7dias"
  | "esteMes"
  | "mesAnterior"
  | "personalizado";

export type DateRange = {
  desde: Date;
  hasta: Date;
};

export const PERIOD_OPTIONS: { id: Exclude<PeriodPreset, "personalizado">; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7dias", label: "7 días" },
  { id: "esteMes", label: "Este mes" },
  { id: "mesAnterior", label: "Mes anterior" },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function rangeForPreset(
  preset: Exclude<PeriodPreset, "personalizado">,
  now = new Date(),
): DateRange {
  const today = startOfDay(now);

  if (preset === "hoy") return { desde: today, hasta: today };

  if (preset === "ayer") {
    const ayer = new Date(today);
    ayer.setDate(ayer.getDate() - 1);
    return { desde: ayer, hasta: ayer };
  }

  if (preset === "7dias") {
    const desde = new Date(today);
    desde.setDate(desde.getDate() - 6);
    return { desde, hasta: today };
  }

  if (preset === "mesAnterior") {
    return {
      desde: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      hasta: new Date(today.getFullYear(), today.getMonth(), 0),
    };
  }

  return {
    desde: new Date(today.getFullYear(), today.getMonth(), 1),
    hasta: today,
  };
}

function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inclusiveDayCount(range: DateRange): number {
  const desde = startOfDay(range.desde).getTime();
  const hasta = startOfDay(range.hasta).getTime();
  return Math.round((hasta - desde) / 86_400_000) + 1;
}

/** Mueve la fecha N meses y, si el día no existe, usa el último del mes destino. */
function shiftMonths(date: Date, months: number): Date {
  const source = startOfDay(date);
  const first = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(source.getDate(), lastDay));
}

/**
 * Período contra el que se compara el rango elegido.
 * Hoy, Ayer, 7 días y Personalizado: la ventana inmediata anterior, misma cantidad de días.
 * Este mes: el mismo tramo un mes atrás.
 * Mes anterior: el mes calendario completo previo.
 */
export function previousRange(range: DateRange, preset: PeriodPreset): DateRange {
  if (preset === "esteMes") {
    return {
      desde: shiftMonths(range.desde, -1),
      hasta: shiftMonths(range.hasta, -1),
    };
  }

  if (preset === "mesAnterior") {
    const source = startOfDay(range.desde);
    return {
      desde: new Date(source.getFullYear(), source.getMonth() - 1, 1),
      hasta: new Date(source.getFullYear(), source.getMonth(), 0),
    };
  }

  const count = Math.max(1, inclusiveDayCount(range));
  const hasta = addDays(range.desde, -1);
  return {
    desde: addDays(hasta, -(count - 1)),
    hasta,
  };
}

export function formatPulsoDay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatPeriodLabel(range: DateRange): string {
  return `${formatPulsoDay(range.desde)} – ${formatPulsoDay(range.hasta)}`;
}

export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
