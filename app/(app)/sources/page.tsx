import { Megaphone } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SourceSummary } from "@/components/sources/source-summary";
import { SourceLeaderboard } from "@/components/sources/source-leaderboard";
import { SourceTrendChart } from "@/components/sources/source-trend-chart";
import { SourceRevenueChart } from "@/components/sources/source-revenue-chart";
import { listLeads } from "@/lib/leads/queries";
import {
  computeSourceMetrics,
  computeSourceOverview,
  pivotMonthlyByCount,
  pivotMonthlyByWonTCV,
} from "@/lib/sources/metrics";

export const metadata = { title: "Sources — Hades Blueprint CRM" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const leads = await listLeads();
  const rows = computeSourceMetrics(leads);
  const overview = computeSourceOverview(rows);
  const trendPivot = pivotMonthlyByCount(rows);
  const revenuePivot = pivotMonthlyByWonTCV(rows);

  const hasAnyLeads = rows.some((r) => r.totalLeads > 0);
  const hasAnyRevenue = rows.some((r) => r.wonTCV > 0);

  return (
    <>
      <TopBar title="Sources" />
      <main className="flex-1 space-y-6 px-8 py-8">
        {/* Hero strip */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-950 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(220,38,38,0.15)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-crimson-600/10 text-crimson-400">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                Where the pipeline actually comes from.
              </h2>
              <p className="text-xs text-muted-foreground">
                Every channel, ranked. Double down on what&rsquo;s printing —
                cut what isn&rsquo;t.
              </p>
            </div>
          </div>
        </div>

        {/* KPI summary */}
        <SourceSummary overview={overview} rows={rows} />

        {/* Charts row */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by source</CardTitle>
              <CardDescription>
                Won TCV per month, stacked by channel — last 12 months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasAnyRevenue ? (
                <SourceRevenueChart
                  sources={rows}
                  pivoted={revenuePivot}
                />
              ) : (
                <EmptyChart message="No closed-won revenue in the last 12 months." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead volume trend</CardTitle>
              <CardDescription>
                New leads per month, broken out by source.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasAnyLeads ? (
                <SourceTrendChart sources={rows} pivoted={trendPivot} />
              ) : (
                <EmptyChart message="No lead activity yet — add one to light this up." />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Source leaderboard</CardTitle>
            <CardDescription>
              Ranked by revenue by default — switch the sort to see volume,
              win rate, or average deal size.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasAnyLeads ? (
              <SourceLeaderboard rows={rows} />
            ) : (
              <EmptyChart message="No sources have activity yet." />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-700 text-center">
      <p className="font-display text-sm font-semibold">Nothing to plot yet.</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
