"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { SourceMetrics } from "@/lib/sources/metrics";

interface SourceTrendChartProps {
  sources: SourceMetrics[];
  pivoted: Array<{ month: string; label: string } & Record<string, number | string>>;
}

export function SourceTrendChart({ sources, pivoted }: SourceTrendChartProps) {
  const visible = sources.filter((s) => s.totalLeads > 0);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            allowDecimals={false}
            tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "var(--font-inter)" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ stroke: "rgba(220,38,38,0.2)", strokeWidth: 1 }}
            content={<TrendTooltip sources={sources} />}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="plainline"
            formatter={(value) => {
              const match = sources.find((s) => s.key === value);
              return match?.label ?? value;
            }}
          />
          {visible.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2.5, fill: s.color }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
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

function TrendTooltip({
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
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/95 px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {rows.map((r) => {
        const match = sources.find((s) => s.key === r.dataKey);
        return (
          <div key={r.dataKey} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="text-muted-foreground">{match?.label ?? r.name}</span>
            <span className="ml-auto font-semibold text-foreground">{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}
