"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney, formatPercent, type MedioPagoItem } from "@/lib/comercial/present";
import styles from "./MediosPagoChart.module.css";

const COLORS = ["#248f62", "#5e90e8", "#7763cf", "#fb9f4d", "#a7adba"];

type MediosPagoChartProps = {
  items: MedioPagoItem[];
};

export function MediosPagoChart({ items }: MediosPagoChartProps) {
  const total = items.reduce((sum, item) => sum + item.importe, 0);

  return (
    <div className={styles.layout}>
      <div className={styles.donut}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="importe"
              nameKey="medio"
              innerRadius="74%"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="#fff"
              strokeWidth={2}
            >
              {items.map((item, index) => (
                <Cell key={item.medio} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatMoney(typeof value === "number" ? value : Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>{formatMoney(total)}</div>
      </div>

      <ul className={styles.legend}>
        {items.map((item, index) => (
          <li key={item.medio} className={styles.legendRow}>
            <span className={styles.name}>
              <span
                className={styles.dot}
                style={{ background: COLORS[index % COLORS.length] }}
              />
              {item.medio}
            </span>
            <span className={styles.amount}>{formatMoney(item.importe)}</span>
            <span className={styles.pct}>{formatPercent(item.participacion)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
