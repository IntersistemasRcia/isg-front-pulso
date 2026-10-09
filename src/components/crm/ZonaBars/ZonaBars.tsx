"use client";

import { formatMoney } from "@/lib/comercial/present";
import type { ZonaItem } from "@/lib/crm/present";
import styles from "./ZonaBars.module.css";

const COLORS = ["#7c69d6", "#5e90e8", "#fb9f4d", "#248f62", "#a7adba"];

type ZonaBarsProps = {
  items: ZonaItem[];
};

export function ZonaBars({ items }: ZonaBarsProps) {
  const max = Math.max(...items.map((item) => item.importe), 1);

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={`${item.zona}-${index}`} className={styles.row}>
          <span className={styles.name}>{item.zona}</span>
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
        </li>
      ))}
    </ul>
  );
}
