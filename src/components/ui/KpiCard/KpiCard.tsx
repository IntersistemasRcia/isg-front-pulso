import type { ReactNode } from "react";
import styles from "./KpiCard.module.css";

export type KpiValueTone = "up" | "down" | "flat";
export type KpiCardTone = "default" | "total" | "facturada" | "pedidos" | "clientes";
export type KpiCardSize = "md" | "sm";

export type KpiCardProps = {
  label: string;
  value: string;
  foot?: ReactNode;
  tone?: KpiCardTone;
  valueTone?: KpiValueTone;
  size?: KpiCardSize;
  loading?: boolean;
};

const toneClass: Record<Exclude<KpiCardTone, "default">, string> = {
  total: styles.toneTotal,
  facturada: styles.toneFacturada,
  pedidos: styles.tonePedidos,
  clientes: styles.toneClientes,
};

const valueToneClass: Record<KpiValueTone, string> = {
  up: styles.valueUp,
  down: styles.valueDown,
  flat: styles.valueFlat,
};

/**
 * Card de indicador reutilizable (Comercial, CRM y otros dashboards).
 */
export function KpiCard({
  label,
  value,
  foot,
  tone = "default",
  valueTone,
  size = "md",
  loading = false,
}: KpiCardProps) {
  const classes = [
    styles.card,
    size === "sm" ? styles.sm : styles.md,
    tone !== "default" ? toneClass[tone] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const valueClasses = [
    styles.value,
    valueTone ? valueToneClass[valueTone] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      <h2 className={styles.label}>{label}</h2>
      <p className={valueClasses}>{loading ? "…" : value}</p>
      {foot ? <p className={styles.foot}>{foot}</p> : null}
    </article>
  );
}

export type KpiGridProps = {
  columns: 3 | 4 | 6;
  children: ReactNode;
  className?: string;
};

export function KpiGrid({ columns, children, className }: KpiGridProps) {
  const colClass =
    columns === 3 ? styles.cols3 : columns === 4 ? styles.cols4 : styles.cols6;
  return (
    <div className={[styles.grid, colClass, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export type KpiSectionProps = {
  title: string;
  children: ReactNode;
};

/** Recuadro con título que agrupa un grid de KPIs (ej. Operaciones). */
export function KpiSection({ title, children }: KpiSectionProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export const kpiDeltaClass = {
  up: styles.deltaUp,
  down: styles.deltaDown,
  flat: styles.deltaFlat,
} as const;
