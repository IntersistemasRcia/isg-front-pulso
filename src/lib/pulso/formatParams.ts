/**
 * Formato de valores para POST /ejecutar-sp.
 * Los nombres de parámetros se resuelven vía SPs_arquitectura (spParamResolver.ts).
 * Fechas: dd/MM/yyyy como en Swagger de isg-api-pulso.
 */

/** Convierte fechas a dd/MM/yyyy como usa Swagger / SQL Server en este ERP. */
export function formatPulsoDateValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;

    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) {
      const [, y, m, d] = iso;
      return `${d}/${m}/${y}`;
    }

    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return value;
}
