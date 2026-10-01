import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignControls } from "@/components/outbound/campaign-controls";
import { CampaignSettings } from "@/components/outbound/campaign-settings";
import { StepsEditor } from "@/components/outbound/steps-editor";
import { LeadImport } from "@/components/outbound/lead-import";
import { LeadActions } from "@/components/outbound/lead-actions";
import { ReplyCard } from "@/components/outbound/reply-card";
import { TestEmail } from "@/components/outbound/test-email";
import { Notice, Stat, pct } from "@/components/outbound/bits";
import { getCampaign, listInbound, listLeads, listMailboxes } from "@/lib/outbound/queries";
import { CAMPAIGN_STATUS_LABEL, LEAD_STATUS_LABEL, REPLY_LABELS } from "@/lib/outbound/labels";
import { describeWindow } from "@/lib/outbound/schedule";
import { normalizeSteps } from "@/lib/outbound/render";
import { currentRole } from "@/lib/leads/queries";
import type { OutboundLeadStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS: OutboundLeadStatus[] = ["queued", "active", "replied", "completed", "bounced", "unsubscribed", "failed", "paused"];

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  const filter = FILTERS.includes(searchParams.status as OutboundLeadStatus)
    ? (searchParams.status as OutboundLeadStatus)
    : undefined;
  const [data, mailboxes, role] = await Promise.all([getCampaign(params.id), listMailboxes(), currentRole()]);
  if (!data) notFound();
  const { campaign, client, mailboxIds, stats, statusCounts } = data;
  const [leads, replies] = await Promise.all([
    listLeads(campaign.id, filter),
    listInbound({ campaignId: campaign.id }),
  ]);

  const steps = normalizeSteps(campaign.steps ?? []);
  const bounceRate = stats.contacted ? stats.bounced / stats.contacted : 0;
  const capacity = mailboxes
    .filter((m) => mailboxIds.includes(m.id) && m.status === "active")
    .reduce((s, m) => s + m.daily_limit, 0);
  const labelName = (v: string | null) => REPLY_LABELS.find((l) => l.value === v)?.label;

  return (
    <>
      <TopBar title={campaign.name} />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Link href="/outbound" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-crimson-400">
              <ArrowLeft className="h-3.5 w-3.5" />
              Outbound
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{campaign.name}</h2>
              <Badge variant={campaign.status === "active" ? "gold" : campaign.status === "completed" ? "outline" : "crimson"}>
                {CAMPAIGN_STATUS_LABEL[campaign.status]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              <Link href={`/clients/${client.id}`} className="hover:text-crimson-400">
                {client.name}
              </Link>
              {" · "}
              {describeWindow(campaign)} · {steps.length} {steps.length === 1 ? "email" : "emails"} ·{" "}
              {capacity} sends/day capacity
              {campaign.started_at && ` · started ${formatDistanceToNow(new Date(campaign.started_at), { addSuffix: true })}`}
            </p>
          </div>
          <CampaignControls id={campaign.id} status={campaign.status} canDelete={role === "admin"} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Leads" value={stats.leads} sub={`${statusCounts.queued} not started`} />
          <Stat label="Contacted" value={stats.contacted} />
          <Stat label="Emails sent" value={stats.sent} />
          <Stat label="Replies" value={stats.replied} sub={`${pct(stats.replied, stats.contacted)} reply rate`} />
          <Stat label="Bounced" value={stats.bounced} sub={`${pct(stats.bounced, stats.contacted)} bounce rate`} />
        </div>

        {stats.contacted >= 20 && bounceRate > 0.03 && (
          <Notice tone="error">
            Bounce rate is over 3%. Pause, verify the rest of the list (NeverBounce, MillionVerifier), then resume.
            Keep going like this and the inboxes get burned.
          </Notice>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-6">
            {replies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Replies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {replies.map((r) => (
                    <ReplyCard key={r.id} msg={r} />
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emails</CardTitle>
                <CardDescription>Day 1 is when a lead gets email 1. Follow-ups skip days outside the send window.</CardDescription>
              </CardHeader>
              <CardContent>
                <StepsEditor
                  campaignId={campaign.id}
                  initial={steps}
                  threaded={campaign.thread_followups}
                  locked={campaign.status === "active"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads</CardTitle>
                <CardDescription>
                  Verify emails before importing. Anyone already in another campaign for {client.name}, or on the do-not-email list, is skipped.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <LeadImport campaignId={campaign.id} />

                <div className="flex flex-wrap gap-1.5">
                  <FilterChip href={`/outbound/${campaign.id}`} active={!filter} label={`All ${stats.leads}`} />
                  {FILTERS.filter((s) => statusCounts[s] > 0).map((s) => (
                    <FilterChip
                      key={s}
                      href={`/outbound/${campaign.id}?status=${s}`}
                      active={filter === s}
                      label={`${LEAD_STATUS_LABEL[s]} ${statusCounts[s]}`}
                    />
                  ))}
                </div>

                {leads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads here.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <p className="font-medium">
                              {[l.first_name, l.last_name].filter(Boolean).join(" ") || l.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {l.email}
                              {l.company && ` · ${l.company}`}
                            </p>
                            {l.last_error && <p className="mt-1 text-xs text-crimson-300">{l.last_error}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.status === "replied" ? "gold" : l.status === "bounced" || l.status === "failed" ? "crimson" : "outline"}>
                              {LEAD_STATUS_LABEL[l.status]}
                            </Badge>
                            {l.reply_label && <p className="mt-1 text-xs text-gold-300">{labelName(l.reply_label)}</p>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {l.current_step}/{steps.length} sent
                            {(l.status === "queued" || l.status === "active") && (
                              <span className="block">
                                next{" "}
                                {new Date(l.next_send_at) <= new Date()
                                  ? "when the window opens"
                                  : formatDistanceToNow(new Date(l.next_send_at), { addSuffix: true })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <LeadActions id={l.id} campaignId={campaign.id} status={l.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {leads.length === 500 && <p className="text-xs text-muted-foreground">Showing the first 500.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <CampaignSettings
                  campaign={campaign}
                  mailboxes={mailboxes.map((m) => ({ id: m.id, email: m.email, status: m.status, daily_limit: m.daily_limit }))}
                  selected={mailboxIds}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send yourself a test</CardTitle>
              </CardHeader>
              <CardContent>
                <TestEmail campaignId={campaign.id} stepCount={steps.length} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-crimson-600 text-foreground" : "border-ink-700 text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const data = await getCampaign(params.id);
  return { title: `${data?.campaign.name ?? "Campaign"} · Cadence GTM` };
}
