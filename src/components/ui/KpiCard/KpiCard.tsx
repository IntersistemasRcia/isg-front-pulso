import type { ReactNode } from "react";
import BarChart from "@mui/icons-material/BarChart";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import Percent from "@mui/icons-material/Percent";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ReceiptOutlined from "@mui/icons-material/ReceiptOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import styles from "./KpiCard.module.css";

export type KpiValueTone = "up" | "down" | "flat";
export type KpiCardTone = "default" | "total" | "facturada" | "pedidos" | "clientes";
export type KpiCardSize = "md" | "sm";
export type KpiIcon =
  | "cart"
  | "document"
  | "receipt"
  | "groups"
  | "chart"
  | "percent"
  | "box"
  | "tag"
  | "receiptLong";
export type KpiIconTone = "blue" | "green" | "orange" | "purple";

const kpiIcons: Record<KpiIcon, ReactNode> = {
  cart: <ShoppingCartOutlined fontSize="inherit" />,
  document: <DescriptionOutlined fontSize="inherit" />,
  receipt: <ReceiptOutlined fontSize="inherit" />,
  groups: <GroupsOutlined fontSize="inherit" />,
  chart: <BarChart fontSize="inherit" />,
  percent: <Percent fontSize="inherit" />,
  box: <Inventory2Outlined fontSize="inherit" />,
  tag: <LocalOfferOutlined fontSize="inherit" />,
  receiptLong: <ReceiptLongOutlined fontSize="inherit" />,
};

const iconToneClass: Record<KpiIconTone, string> = {
  blue: styles.iconBlue,
  green: styles.iconGreen,
  orange: styles.iconOrange,
  purple: styles.iconPurple,
};

export type KpiCardProps = {
  label: string;
  value: string;
  foot?: ReactNode;
  tone?: KpiCardTone;
  valueTone?: KpiValueTone;
  icon?: KpiIcon;
  iconTone?: KpiIconTone;
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
  icon,
  iconTone = "blue",
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
      <div className={styles.head}>
        {icon ? (
          <span className={[styles.iconBadge, iconToneClass[iconTone]].join(" ")} aria-hidden>
            {kpiIcons[icon]}
          </span>
        ) : null}
        <div className={styles.headBody}>
          <h2 className={styles.label}>{label}</h2>
          <p className={valueClasses}>{loading ? "…" : value}</p>
        </div>
      </div>
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
