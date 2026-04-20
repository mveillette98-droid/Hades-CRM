import { formatCompactCurrency } from "@/lib/utils";
import { LEAD_SOURCE_LABEL } from "@/lib/leads/labels";
import type { LeadSource } from "@/lib/supabase/types";
import type { MixRow } from "@/lib/dashboard/metrics";

interface SourceBreakdownProps {
  rows: MixRow[];
}

export function SourceBreakdown({ rows }: SourceBreakdownProps) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No leads yet — sources populate as you log them.
      </p>
    );
  }

  const maxTCV = Math.max(...rows.map((r) => r.tcv), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const label = LEAD_SOURCE_LABEL[r.key as LeadSource] ?? r.label;
        const pct = Math.max(2, Math.round((r.tcv / maxTCV) * 100));
        return (
          <li key={r.key} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground">
                {label}
              </span>
              <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums text-muted-foreground">
                <span>{r.count}</span>
                <span className="text-gold-300">
                  {formatCompactCurrency(r.tcv)}
                </span>
              </div>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-crimson-600"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
