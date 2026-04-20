"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCompactCurrency } from "@/lib/utils";
import { DEAL_TYPE_LABEL } from "@/lib/leads/labels";
import type { DealType } from "@/lib/supabase/types";
import type { MixRow } from "@/lib/dashboard/metrics";

interface DealTypeMixProps {
  rows: MixRow[];
}

// Crimson → gold spectrum so everything stays on brand.
const PALETTE = [
  "#dc2626", // crimson-600
  "#f97316", // orange-500
  "#eab308", // gold-500
  "#fbbf24", // gold-400
  "#94a3b8", // slate-400
];

export function DealTypeMix({ rows }: DealTypeMixProps) {
  const data = rows.map((r, i) => ({
    ...r,
    label: DEAL_TYPE_LABEL[r.key as DealType] ?? r.label,
    fill: PALETTE[i % PALETTE.length],
  }));

  const total = data.reduce((s, d) => s + d.tcv, 0);

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
        No open deals yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[160px_1fr]">
      <div className="relative h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="tcv"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip content={<MixTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Open TCV
          </p>
          <p className="font-display text-base font-semibold text-gold-300">
            {formatCompactCurrency(total)}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 text-xs">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.tcv / total) * 100) : 0;
          return (
            <li
              key={d.key}
              className="flex items-center justify-between gap-3 rounded-md border border-transparent px-1 py-1"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: d.fill }}
                />
                <span className="truncate text-foreground">{d.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums text-muted-foreground">
                <span>{d.count}</span>
                <span className="text-gold-300">
                  {formatCompactCurrency(d.tcv)}
                </span>
                <span className="w-8 text-right">{pct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface TooltipPayload {
  payload: MixRow & { fill: string; label: string };
}

function MixTooltip({
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
      <p className="font-semibold text-foreground">{row.label}</p>
      <p className="text-muted-foreground">
        <span className="text-foreground">{row.count}</span>{" "}
        {row.count === 1 ? "deal" : "deals"}
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
