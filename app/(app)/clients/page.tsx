import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bot, Briefcase } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientSheet } from "@/components/clients/client-sheet";
import { listClients } from "@/lib/clients/queries";
import { CLIENT_STATUS_LABEL } from "@/lib/clients/labels";
import { formatCompactCurrency } from "@/lib/utils";

export const metadata = { title: "Clients · Cadence GTM" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();
  const live = clients.filter((c) => c.status === "active" || c.status === "onboarding");
  const mrr = live.reduce((sum, c) => sum + Number(c.monthly_retainer ?? 0), 0);

  return (
    <>
      <TopBar title="Clients" />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {live.length} live · {formatCompactCurrency(mrr)} retained MRR
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Fulfillment</h2>
          </div>
          <ClientSheet mode="create" />
        </div>

        {clients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <Briefcase className="h-8 w-8 text-crimson-500" />
              <div className="space-y-1">
                <p className="font-display text-lg font-semibold">No clients yet.</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Add one to fill its brief, then run the agents. No client yet? Add a real
                  firm you want to land and test the output on them. If you wouldn&rsquo;t
                  send it, the agents need work before the offer does.
                </p>
              </div>
              <ClientSheet mode="create" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`}>
                <Card className="hb-hover-glow h-full transition-colors">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.vertical}</p>
                      </div>
                      <Badge variant={c.status === "active" ? "gold" : c.status === "churned" ? "lost" : "crimson"}>
                        {CLIENT_STATUS_LABEL[c.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-display text-base font-semibold text-gold-300">
                        {formatCompactCurrency(Number(c.monthly_retainer))}
                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5" />
                        {c.run_count} {c.run_count === 1 ? "run" : "runs"}
                        {c.last_run_at &&
                          ` · ${formatDistanceToNow(new Date(c.last_run_at), { addSuffix: true })}`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
