import { formatMoney, formatPercent, type SucursalItem } from "@/lib/comercial/present";
import styles from "./SucursalBars.module.css";

const COLORS = ["#7c69d6", "#5e90e8", "#fb9f4d", "#248f62", "#a7adba"];

type SucursalBarsProps = {
  items: SucursalItem[];
};

export function SucursalBars({ items }: SucursalBarsProps) {
  const max = Math.max(...items.map((item) => item.importe), 1);

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={`${item.sucursal}-${index}`} className={styles.row}>
          <span className={styles.name}>{item.sucursal}</span>
          <span className={styles.track}>
            <span
              className={styles.bar}
              style={{
                width: `${Math.max(4, (item.importe / max) * 100)}%`,
                background: COLORS[index % COLORS.length],
              }}
            />
          </span>
          <span className={styles.amount}>{formatMoney(item.importe)}</span>
          <span className={styles.pct}>{formatPercent(item.participacion)}</span>
        </li>
      ))}
    </ul>
  );
}
