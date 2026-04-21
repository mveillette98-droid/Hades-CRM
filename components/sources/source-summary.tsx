import { Activity, Crown, Flame, Trophy } from "lucide-react";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { formatCompactCurrency } from "@/lib/utils";
import type {
  SourceMetrics,
  SourceOverview,
} from "@/lib/sources/metrics";

interface SourceSummaryProps {
  overview: SourceOverview;
  rows: SourceMetrics[];
}

export function SourceSummary({ overview, rows }: SourceSummaryProps) {
  const trendingUp = rows.filter(
    (r) => r.leadsThisMonth > r.leadsPrevMonth
  ).length;

  const topRev = overview.topRevenueSource;
  const topVol = overview.topVolumeSource;
  const bestWin = overview.bestWinRateSource;

  return (
    <section
      aria-label="Source performance summary"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiTile
        label="Active sources"
        value={`${overview.activeSources}/${overview.totalSources}`}
        sub={`${trendingUp} trending up vs last month`}
        icon={Activity}
        accent="crimson"
      />
      <KpiTile
        label="Top revenue source"
        value={topRev ? topRev.label : "—"}
        sub={
          topRev
            ? `${formatCompactCurrency(topRev.wonTCV)} won all-time`
            : "No closed deals yet."
        }
        icon={Crown}
        accent="gold"
      />
      <KpiTile
        label="Top volume source"
        value={topVol ? topVol.label : "—"}
        sub={
          topVol
            ? `${topVol.totalLeads} leads · ${formatCompactCurrency(topVol.openTCV)} open`
            : "No leads in the system."
        }
        icon={Flame}
        accent="crimson"
      />
      <KpiTile
        label="Best win rate"
        value={
          bestWin && bestWin.winRate != null
            ? `${Math.round(bestWin.winRate * 100)}%`
            : "—"
        }
        sub={
          bestWin
            ? `${bestWin.label} · ${bestWin.closedLeads} closed`
            : "Need ≥2 closed deals to rank."
        }
        icon={Trophy}
        accent="gold"
      />
    </section>
  );
}
