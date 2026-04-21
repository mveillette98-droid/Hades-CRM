"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { formatCompactCurrency } from "@/lib/utils";
import type { SourceMetrics } from "@/lib/sources/metrics";

interface SourceRevenueChartProps {
  sources: SourceMetrics[];
  pivoted: Array<{ month: string; label: string } & Record<string, number | string>>;
}

export function SourceRevenueChart({
  sources,
  pivoted,
}: SourceRevenueChartProps) {
  const visible = sources.filter((s) => s.wonTCV > 0);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={pivoted}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "var(--font-inter)" }}
            axisLine={{ stroke: "#3f3f46" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "var(--font-inter)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatCompactCurrency(v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(220,38,38,0.06)" }}
            content={<RevenueTooltip sources={sources} />}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="square"
            formatter={(value) => {
              const match = sources.find((s) => s.key === value);
              return match?.label ?? value;
            }}
          />
          {visible.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="revenue"
              fill={s.color}
              radius={
                i === visible.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function RevenueTooltip({
  active,
  payload,
  label,
  sources,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  sources: SourceMetrics[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="min-w-[180px] rounded-md border border-ink-700 bg-ink-900/95 px-3 py-2 text-xs shadow-card">
      <p className="mb-1.5 flex items-center justify-between font-semibold text-foreground">
        <span>{label}</span>
        <span className="text-gold-300">{formatCompactCurrency(total)}</span>
      </p>
      {rows.map((r) => {
        const match = sources.find((s) => s.key === r.dataKey);
        return (
          <div key={r.dataKey} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: r.color }}
            />
            <span className="text-muted-foreground">{match?.label ?? r.name}</span>
            <span className="ml-auto font-semibold text-foreground">
              {formatCompactCurrency(r.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
