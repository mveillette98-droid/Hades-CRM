import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { LeadSheet } from "@/components/leads/lead-sheet";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { listLeads, listStages, listTeam } from "@/lib/leads/queries";
import { formatCompactCurrency } from "@/lib/utils";
import { KanbanSquare } from "lucide-react";

export const metadata = { title: "Pipeline — Hades Blueprint CRM" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [leads, stages, team] = await Promise.all([
    listLeads(),
    listStages(),
    listTeam(),
  ]);

  const openLeads = leads.filter((l) => !l.stage?.is_won && !l.stage?.is_lost);
  const openTCV = openLeads.reduce(
    (sum, l) => sum + Number(l.total_contract_value ?? 0),
    0
  );
  const openMRR = openLeads.reduce(
    (sum, l) => sum + Number(l.monthly_recurring_value ?? 0),
    0
  );

  return (
    <>
      <TopBar title="Pipeline" />
      <main className="flex min-h-0 flex-1 flex-col gap-4 px-8 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {openLeads.length} open · {formatCompactCurrency(openTCV)} in-flight TCV · {formatCompactCurrency(openMRR)}/mo pending MRR
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Pipeline
            </h2>
          </div>
          <LeadSheet mode="create" stages={stages} team={team} />
        </div>

        {leads.length === 0 ? (
          <EmptyBoard stages={stages} team={team} />
        ) : (
          <div className="min-h-0 flex-1">
            <KanbanBoard stages={stages} leads={leads} team={team} />
          </div>
        )}
      </main>
    </>
  );
}

function EmptyBoard({
  stages,
  team,
}: {
  stages: Awaited<ReturnType<typeof listStages>>;
  team: Awaited<ReturnType<typeof listTeam>>;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-ink-700 bg-ink-900">
          <KanbanSquare className="h-5 w-5 text-crimson-500" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold">
            Empty board. Empty bank.
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Log your first lead and drag it across stages as it moves. Each
            column shows one-time and MRR totals live.
          </p>
        </div>
        <LeadSheet
          mode="create"
          stages={stages}
          team={team}
          triggerLabel="Add your first lead"
        />
      </CardContent>
    </Card>
  );
}
