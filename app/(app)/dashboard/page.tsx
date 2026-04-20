import Link from "next/link";
import {
  Activity,
  Banknote,
  Flame,
  KanbanSquare,
  Scale,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MantraStrip } from "@/components/mantra-strip";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { StageFunnel } from "@/components/dashboard/stage-funnel";
import { DealTypeMix } from "@/components/dashboard/deal-type-mix";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";
import { ActivityStream } from "@/components/dashboard/activity-stream";
import { HotLeads } from "@/components/dashboard/hot-leads";
import {
  listLeads,
  listStages,
  listRecentActivity,
} from "@/lib/leads/queries";
import {
  computeOverview,
  computeFunnel,
  computeDealTypeMix,
  computeSourceMix,
  computeHotLeads,
} from "@/lib/dashboard/metrics";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency } from "@/lib/utils";

export const metadata = { title: "Dashboard — Hades Blueprint CRM" };
export const dynamic = "force-dynamic";

function greetingFor(hour: number) {
  if (hour < 5) return "Still at it";
  if (hour < 12) return "Morning mark";
  if (hour < 17) return "Midday check";
  if (hour < 21) return "Closing window";
  return "Night shift";
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileRes, leads, stages, activity] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user?.id ?? "")
      .maybeSingle<{ full_name: string | null }>(),
    listLeads(),
    listStages(),
    listRecentActivity(15),
  ]);

  const profile = profileRes.data;
  const firstName =
    profile?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "Operator";
  const greeting = `${greetingFor(new Date().getHours())}, ${firstName}`;

  const overview = computeOverview(leads);
  const funnel = computeFunnel(leads, stages);
  const dealMix = computeDealTypeMix(leads);
  const sourceMix = computeSourceMix(leads);
  const hot = computeHotLeads(leads, 5);

  const stageNameById = Object.fromEntries(
    stages.map((s) => [s.id, s.name])
  ) as Record<string, string>;

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 space-y-6 px-8 py-8">
        <MantraStrip greeting={greeting} />

        {/* KPI row */}
        <section
          aria-label="Key metrics"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiTile
            label="Open pipeline"
            value={formatCompactCurrency(overview.openTCV)}
            sub={`${overview.openCount} open · ${formatCompactCurrency(overview.openMRR)}/mo pending MRR`}
            icon={KanbanSquare}
            accent="crimson"
          />
          <KpiTile
            label="Weighted forecast"
            value={formatCompactCurrency(overview.weightedPipeline)}
            sub="TCV × stage probability"
            icon={Scale}
            accent="crimson"
          />
          <KpiTile
            label="Won this month"
            value={formatCompactCurrency(overview.wonThisMonthTCV)}
            sub={
              overview.wonThisMonthCount === 0
                ? "No deals closed yet — go get one."
                : `${overview.wonThisMonthCount} ${
                    overview.wonThisMonthCount === 1 ? "deal" : "deals"
                  } · ${formatCompactCurrency(overview.wonThisMonthMRR)}/mo new MRR`
            }
            icon={Target}
            accent="gold"
          />
          <KpiTile
            label="MRR on the books"
            value={formatCompactCurrency(overview.mrrOnBooks)}
            sub="All-time recurring from won deals"
            icon={Banknote}
            accent="gold"
          />
        </section>

        {/* Velocity strip */}
        <section
          aria-label="Win velocity"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <KpiTile
            label="Win rate · 90d"
            value={
              overview.winRate90d == null
                ? "—"
                : `${Math.round(overview.winRate90d * 100)}%`
            }
            sub={`${overview.closedLast90Count} closed in last 90 days`}
            icon={TrendingUp}
            accent="muted"
          />
          <KpiTile
            label="Avg days to close"
            value={
              overview.avgDaysToClose == null
                ? "—"
                : `${Math.round(overview.avgDaysToClose)}d`
            }
            sub="From created → won (last 90d)"
            icon={Timer}
            accent="muted"
          />
          <KpiTile
            label="Pipeline velocity"
            value={
              overview.avgDaysToClose && overview.avgDaysToClose > 0
                ? formatCompactCurrency(
                    (overview.weightedPipeline / overview.avgDaysToClose) * 30
                  ) + "/mo"
                : "—"
            }
            sub="Weighted ÷ avg cycle · normalized to 30d"
            icon={Activity}
            accent="muted"
          />
        </section>

        {/* Charts row */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Pipeline funnel</CardTitle>
              <CardDescription>
                Leads in each stage. Hover for TCV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <EmptyChart />
              ) : (
                <StageFunnel rows={funnel} />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Deal type mix</CardTitle>
              <CardDescription>Open TCV by product line.</CardDescription>
            </CardHeader>
            <CardContent>
              <DealTypeMix rows={dealMix} />
            </CardContent>
          </Card>
        </section>

        {/* Hot leads + sources + activity */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-crimson-500" />
                Hot leads
              </CardTitle>
              <CardDescription>
                Top weighted opportunities open right now.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HotLeads leads={hot} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Sources</CardTitle>
              <CardDescription>
                Where pipeline is actually coming from.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SourceBreakdown rows={sourceMix} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Everything moving on the board.</CardDescription>
              </div>
              <Link
                href="/leads"
                className="text-[11px] font-semibold uppercase tracking-wider text-crimson-400 hover:text-crimson-300"
              >
                All leads →
              </Link>
            </CardHeader>
            <CardContent>
              <ActivityStream
                items={activity}
                stageNameById={stageNameById}
              />
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-700 text-center">
      <p className="font-display text-sm font-semibold">No data yet.</p>
      <p className="text-xs text-muted-foreground">
        Add your first lead and this fills in instantly.
      </p>
    </div>
  );
}
