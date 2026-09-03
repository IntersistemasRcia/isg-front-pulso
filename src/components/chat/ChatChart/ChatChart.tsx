"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  coalescePieSlices,
  formatArNumber,
  type ChartSpec,
} from "@/lib/chat/tabularSpec";
import styles from "./ChatChart.module.css";

const PALETTE = ["#ff8a00", "#6a2ed2", "#ff6a00", "#3a1580", "#ffb380", "#250a57", "#cfc0d8", "#8a8490"];
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };

type PlotRow = Record<string, string | number>;

function toPlotRows(spec: ChartSpec): PlotRow[] {
  return spec.data.map((row) => {
    const out: PlotRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value == null) continue;
      out[key] = typeof value === "boolean" ? (value ? "Sí" : "No") : value;
    }
    out[spec.labelKey] = String(row[spec.labelKey] ?? "");
    out[spec.valueKey] = Number(row[spec.valueKey]);
    return out;
  });
}

/** Hijos directos de Recharts (no envolver en un componente custom: Recharts inspecciona type). */
function cartesianGuides(labelKey: string) {
  return [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#e6dde9" />,
    <XAxis key="x" dataKey={labelKey} tick={{ fontSize: 11 }} />,
    <YAxis key="y" tick={{ fontSize: 11 }} tickFormatter={formatArNumber} />,
    <Tooltip key="tip" formatter={(value) => formatArNumber(value)} />,
  ];
}

export type ChatChartProps = {
  spec: ChartSpec;
};

export function ChatChart({ spec }: ChatChartProps) {
  const prepared = spec.type === "pie" ? coalescePieSlices(spec) : spec;
  const rows = toPlotRows(prepared);
  const { type, labelKey, valueKey } = prepared;

  return (
    <figure className={styles.wrap}>
      {prepared.title ? <figcaption className={styles.title}>{prepared.title}</figcaption> : null}
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={rows} margin={CHART_MARGIN}>
              {cartesianGuides(labelKey)}
              <Line type="monotone" dataKey={valueKey} stroke="#6a2ed2" strokeWidth={2} dot={false} />
            </LineChart>
          ) : type === "pie" ? (
            <PieChart>
              <Pie data={rows} dataKey={valueKey} nameKey={labelKey} innerRadius={48} outerRadius={80} paddingAngle={2}>
                {rows.map((_, index) => (
                  <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatArNumber(value)} />
              <Legend />
            </PieChart>
          ) : (
            <BarChart data={rows} margin={CHART_MARGIN}>
              {cartesianGuides(labelKey)}
              <Bar dataKey={valueKey} fill="#ff8a00" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
