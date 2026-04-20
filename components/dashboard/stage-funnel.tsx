"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatCompactCurrency } from "@/lib/utils";
import type { FunnelRow } from "@/lib/dashboard/metrics";

interface StageFunnelProps {
  rows: FunnelRow[];
}

export function StageFunnel({ rows }: StageFunnelProps) {
  // Open + won are crimson/gold; lost is muted.
  const data = rows.map((r) => ({
    ...r,
    fill: r.isLost ? "#3f3f46" : r.isWon ? "#eab308" : "#dc2626",
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          barCategoryGap={6}
        >
          <XAxis
            type="number"
            hide
            domain={[0, "dataMax"]}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{
              fill: "#a1a1aa",
              fontSize: 11,
              fontFamily: "var(--font-inter)",
            }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(220,38,38,0.08)" }}
            content={<FunnelTooltip />}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.stageId} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  payload: FunnelRow & { fill: string };
}

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || !payload[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/95 px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-foreground">{row.name}</p>
      <p className="text-muted-foreground">
        <span className="text-foreground">{row.count}</span>{" "}
        {row.count === 1 ? "lead" : "leads"}
      </p>
      <p className="text-muted-foreground">
        <span className="text-gold-300">
          {formatCompactCurrency(row.tcv)}
        </span>{" "}
        TCV
      </p>
    </div>
  );
}
