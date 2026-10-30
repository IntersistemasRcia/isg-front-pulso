const money = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

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

function formatScaled(scaled: number): string {
  const tenths = Math.round(scaled * 10) / 10;
  return compact.format(tenths);
}

/**
 * Escala importes: >= 1e9 → B, >= 1e6 → M, >= 1e3 → K.
 * Locale es-AR. Conserva el signo.
 */
export function formatMoney(value: unknown): string {
  const amount = asNumber(value);
  if (amount == null) return "—";
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}$ ${formatScaled(abs / 1_000_000_000)} B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$ ${formatScaled(abs / 1_000_000)} M`;
  }
  if (abs >= 1_000) {
    return `${sign}$ ${formatScaled(abs / 1_000)} K`;
  }
  return `$ ${money.format(rounded)}`;
}
