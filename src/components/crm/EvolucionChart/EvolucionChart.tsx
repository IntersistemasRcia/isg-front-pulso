"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/comercial/present";
import type { EvolucionPunto } from "@/lib/crm/present";
import styles from "./EvolucionChart.module.css";

type EvolucionChartProps = {
  points: EvolucionPunto[];
};

export function EvolucionChart({ points }: EvolucionChartProps) {
  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eef0f6" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#697189" }} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip formatter={(value) => formatMoney(typeof value === "number" ? value : Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="venta"
            name="Venta comercial"
            stroke="#545386"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="pedidos"
            name="Pedidos y débitos internos"
            stroke="#d75e00"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
