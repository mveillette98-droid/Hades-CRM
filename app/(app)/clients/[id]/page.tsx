import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientSheet } from "@/components/clients/client-sheet";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { AgentConsole } from "@/components/clients/agent-console";
import { RunHistory } from "@/components/clients/run-history";
import { RunOutput } from "@/components/clients/run-output";
import { ApproveToggle } from "@/components/clients/approve-toggle";
import { getClient, listRuns } from "@/lib/clients/queries";
import { currentRole } from "@/lib/leads/queries";
import { AGENT_LABEL, BRIEF_FIELDS, CLIENT_STATUS_LABEL } from "@/lib/clients/labels";
import type { RunState } from "@/lib/agents/pipelines";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { run?: string };
}) {
  const [client, runs, role] = await Promise.all([
    getClient(params.id),
    listRuns(params.id),
    currentRole(),
  ]);
  if (!client) notFound();

  const hasResearch = runs.some(
    (r) => r.kind === "research" && r.status === "succeeded" && (r.output as RunState | null)?.brief
  );
  const activeRun = runs.find((r) => r.status === "running") ?? null;
  const selected =
    runs.find((r) => r.id === searchParams.run) ??
    runs.find((r) => r.status === "succeeded") ??
    activeRun ??
    null;

  const emptyBriefFields = BRIEF_FIELDS.filter((f) => !client[f.key]?.trim());

  return (
    <>
      <TopBar title={client.name} />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-crimson-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All clients
          </Link>
          <div className="flex items-center gap-2">
            <ClientSheet mode="edit" client={client} />
            {role === "admin" && <DeleteClientButton clientId={client.id} name={client.name} />}
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {client.vertical}
              </p>
              <CardTitle className="text-2xl">{client.name}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <Badge variant={client.status === "active" ? "gold" : "crimson"}>
                  {CLIENT_STATUS_LABEL[client.status]}
                </Badge>
                {client.website_url && (
                  <a
                    href={client.website_url.startsWith("http") ? client.website_url : `https://${client.website_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:text-crimson-400"
                  >
                    <Globe className="h-3 w-3" />
                    {client.website_url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">Retainer</p>
              <p className="font-display text-3xl font-bold text-gold-300">
                {formatCurrency(Number(client.monthly_retainer))}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent team</CardTitle>
                <CardDescription>
                  Research feeds the writers. Every draft goes through the critic before you see it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {emptyBriefFields.length > 0 && (
                  <p className="rounded-md border border-gold-700/40 bg-gold-900/10 px-3 py-2 text-xs text-gold-200">
                    Brief is missing {emptyBriefFields.map((f) => f.label.toLowerCase()).join(", ")}.
                    The agents will guess. Fill it in for sharper output.
                  </p>
                )}
                <AgentConsole
                  clientId={client.id}
                  hasResearch={hasResearch}
                  activeRun={
                    activeRun
                      ? { id: activeRun.id, kind: activeRun.kind, step: activeRun.step, error: activeRun.error }
                      : null
                  }
                />
              </CardContent>
            </Card>

            {selected && (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle>{AGENT_LABEL[selected.kind]}</CardTitle>
                    <CardDescription>
                      {new Date(selected.created_at).toLocaleString()}
                      {selected.instructions && ` · Steer: ${selected.instructions}`}
                    </CardDescription>
                  </div>
                  {selected.status === "succeeded" && (
                    <ApproveToggle runId={selected.id} clientId={client.id} approved={selected.approved} />
                  )}
                </CardHeader>
                <CardContent>
                  <RunOutput run={selected} />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <RunHistory runs={runs} clientId={client.id} selectedId={selected?.id ?? null} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Brief</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  {BRIEF_FIELDS.map((f) => (
                    <div key={f.key}>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {f.label}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-foreground/90">
                        {client[f.key]?.trim() || <span className="text-muted-foreground">Not set</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const client = await getClient(params.id);
  return { title: `${client?.name ?? "Client"} · Cadence GTM` };
}
