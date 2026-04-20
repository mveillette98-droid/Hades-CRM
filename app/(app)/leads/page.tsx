import { Users } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { LeadSheet } from "@/components/leads/lead-sheet";
import { LeadsList } from "@/components/leads/leads-list";
import {
  currentRole,
  listLeads,
  listStages,
  listTeam,
} from "@/lib/leads/queries";
import { formatCompactCurrency } from "@/lib/utils";

export const metadata = { title: "Leads — Hades Blueprint CRM" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, stages, team, role] = await Promise.all([
    listLeads(),
    listStages(),
    listTeam(),
    currentRole(),
  ]);

  const totalTCV = leads.reduce(
    (sum, l) => sum + Number(l.total_contract_value ?? 0),
    0
  );
  const totalMRR = leads.reduce(
    (sum, l) => sum + Number(l.monthly_recurring_value ?? 0),
    0
  );

  return (
    <>
      <TopBar title="Leads" />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {leads.length} {leads.length === 1 ? "lead" : "leads"} ·{" "}
              {formatCompactCurrency(totalTCV)} TCV ·{" "}
              {formatCompactCurrency(totalMRR)} MRR
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              All leads
            </h2>
          </div>
          <LeadSheet mode="create" stages={stages} team={team} />
        </div>

        {leads.length === 0 ? (
          <EmptyState stages={stages} team={team} />
        ) : (
          <LeadsList
            leads={leads}
            stages={stages}
            team={team}
            isAdmin={role === "admin"}
          />
        )}
      </main>
    </>
  );
}

function EmptyState({
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
          <Users className="h-5 w-5 text-crimson-500" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold">No leads yet.</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Pick up the phone. Log the call. Build the pipeline. Add your first
            lead below.
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
