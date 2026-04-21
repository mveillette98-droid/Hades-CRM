"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { SourceMetrics } from "@/lib/sources/metrics";

type SortKey = "wonTCV" | "openTCV" | "totalLeads" | "winRate" | "avgDealSize";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "wonTCV", label: "Revenue" },
  { key: "openTCV", label: "Pipeline" },
  { key: "totalLeads", label: "Volume" },
  { key: "winRate", label: "Win rate" },
  { key: "avgDealSize", label: "Avg deal" },
];

interface SourceLeaderboardProps {
  rows: SourceMetrics[];
}

export function SourceLeaderboard({ rows }: SourceLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("wonTCV");

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    // Null-last
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (vb as number) - (va as number);
  });

  const maxValue = Math.max(
    1,
    ...sorted.map((r) => Number(r[sortKey] ?? 0))
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sort by
        </span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSortKey(opt.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
              sortKey === opt.key
                ? "border-crimson-600 bg-crimson-950/40 text-crimson-300"
                : "border-ink-700 bg-ink-900 text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ol className="space-y-2">
        {sorted.map((row, i) => (
          <LeaderboardRow
            key={row.key}
            row={row}
            rank={i + 1}
            sortKey={sortKey}
            maxValue={maxValue}
          />
        ))}
      </ol>
    </div>
  );
}

function LeaderboardRow({
  row,
  rank,
  sortKey,
  maxValue,
}: {
  row: SourceMetrics;
  rank: number;
  sortKey: SortKey;
  maxValue: number;
}) {
  const barValue = Number(row[sortKey] ?? 0);
  const barPct = maxValue > 0 ? (barValue / maxValue) * 100 : 0;
  const trendDelta = row.leadsThisMonth - row.leadsPrevMonth;

  return (
    <li>
      <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-3 transition-colors hover:border-ink-600">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink-850 font-display text-xs font-bold text-foreground">
          {rank}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: row.color }}
            />
            <p className="truncate text-sm font-semibold text-foreground">
              {row.label}
            </p>
            <TrendPill delta={trendDelta} />
          </div>

          {/* Bar */}
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-850">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, background: row.color }}
            />
          </div>

          {/* Stats row */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <Stat
              label="Revenue"
              value={formatCompactCurrency(row.wonTCV)}
              strong={sortKey === "wonTCV"}
            />
            <Stat
              label="Pipeline"
              value={formatCompactCurrency(row.openTCV)}
              strong={sortKey === "openTCV"}
            />
            <Stat
              label="Leads"
              value={`${row.totalLeads}`}
              strong={sortKey === "totalLeads"}
            />
            <Stat
              label="Win rate"
              value={
                row.winRate == null
                  ? "—"
                  : `${Math.round(row.winRate * 100)}%`
              }
              strong={sortKey === "winRate"}
            />
            <Stat
              label="Avg deal"
              value={
                row.avgDealSize == null
                  ? "—"
                  : formatCompactCurrency(row.avgDealSize)
              }
              strong={sortKey === "avgDealSize"}
            />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-bold text-foreground">
            {formatForSortKey(row, sortKey)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {SORT_OPTIONS.find((o) => o.key === sortKey)?.label}
          </p>
        </div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        strong && "text-foreground"
      )}
    >
      <span className="uppercase tracking-wider">{label}:</span>{" "}
      <span className={cn("font-medium", strong && "text-foreground")}>
        {value}
      </span>
    </span>
  );
}

function TrendPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-sm bg-ink-850 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Minus className="h-2.5 w-2.5" />
        flat
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        up ? "bg-crimson-950/50 text-crimson-300" : "bg-ink-850 text-muted-foreground"
      )}
    >
      {up ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {up ? "+" : ""}
      {delta} MoM
    </span>
  );
}

function formatForSortKey(row: SourceMetrics, key: SortKey): string {
  switch (key) {
    case "wonTCV":
      return formatCompactCurrency(row.wonTCV);
    case "openTCV":
      return formatCompactCurrency(row.openTCV);
    case "totalLeads":
      return `${row.totalLeads}`;
    case "winRate":
      return row.winRate == null
        ? "—"
        : `${Math.round(row.winRate * 100)}%`;
    case "avgDealSize":
      return row.avgDealSize == null
        ? "—"
        : formatCompactCurrency(row.avgDealSize);
  }
}
