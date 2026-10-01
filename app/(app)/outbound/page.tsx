import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Inbox, Mail, Send } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/clients/copy-button";
import { MailboxDialog } from "@/components/outbound/mailbox-dialog";
import { MailboxActions } from "@/components/outbound/mailbox-actions";
import { NewCampaignButton } from "@/components/outbound/new-campaign-button";
import { ReplyCard } from "@/components/outbound/reply-card";
import { SuppressForm } from "@/components/outbound/suppress-form";
import { pct } from "@/components/outbound/bits";
import { listCampaigns, listInbound, listMailboxes, senderHeartbeat } from "@/lib/outbound/queries";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/outbound/labels";
import { currentRole } from "@/lib/leads/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Outbound · Cadence GTM" };
export const dynamic = "force-dynamic";

export default async function OutboundPage() {
  const supabase = createClient();
  const [mailboxes, campaigns, replies, heartbeat, role, { data: clientRows }] = await Promise.all([
    listMailboxes(),
    listCampaigns(),
    listInbound(),
    senderHeartbeat(),
    currentRole(),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  const clients = (clientRows ?? []) as { id: string; name: string }[];
  const running = heartbeat && Date.now() - new Date(heartbeat).getTime() < 3 * 60 * 1000;
  const sending = campaigns.some((c) => c.status === "active");
  const unhandled = replies.filter((r) => !r.handled);

  return (
    <>
      <TopBar title="Outbound" />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {campaigns.filter((c) => c.status === "active").length} sending · {mailboxes.length} inboxes ·{" "}
              {unhandled.length} new {unhandled.length === 1 ? "reply" : "replies"}
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Cold email</h2>
          </div>
          <NewCampaignButton clients={clients} />
        </div>

        <SenderStatus running={!!running} heartbeat={heartbeat} sending={sending} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-gold-400" />
              Replies
            </CardTitle>
            <CardDescription>A reply stops that lead&rsquo;s sequence. Tag it so the client report counts it.</CardDescription>
          </CardHeader>
          <CardContent>
            {replies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No replies yet.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {replies.slice(0, 20).map((r) => (
                  <ReplyCard key={r.id} msg={r} showCampaign />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-crimson-500" />
              Campaigns
            </CardTitle>
            <CardDescription>
              Most start from a client&rsquo;s cold email run: open the run and hit &ldquo;Send with Cadence&rdquo; on a sequence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Bounced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/outbound/${c.id}`} className="font-medium hover:text-crimson-400">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.client_name}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "gold" : c.status === "completed" ? "outline" : "crimson"}>
                          {CAMPAIGN_STATUS_LABEL[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{c.stats.leads}</TableCell>
                      <TableCell className="text-right">{c.stats.sent}</TableCell>
                      <TableCell className="text-right">
                        {c.stats.replied}{" "}
                        <span className="text-xs text-muted-foreground">({pct(c.stats.replied, c.stats.contacted)})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.stats.bounced}{" "}
                        <span className="text-xs text-muted-foreground">({pct(c.stats.bounced, c.stats.contacted)})</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-crimson-500" />
                  Sending inboxes
                </CardTitle>
                <CardDescription>
                  Warm every new inbox for 2 to 3 weeks before it sends a campaign. Cadence doesn&rsquo;t
                  warm inboxes. Use a warmup service on each one.
                </CardDescription>
              </div>
              <MailboxDialog clients={clients} />
            </CardHeader>
            <CardContent>
              {mailboxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No inboxes yet. Add one, then hit Test to check it can log in.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inbox</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Last 24h</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mailboxes.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <p className="font-medium">{m.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.from_name}
                            {m.client_name && ` · ${m.client_name}`}
                            {m.last_checked_at &&
                              ` · replies checked ${formatDistanceToNow(new Date(m.last_checked_at), { addSuffix: true })}`}
                          </p>
                          {m.last_error && <p className="mt-1 text-xs text-crimson-300">{m.last_error}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.status === "active" ? "gold" : m.status === "error" ? "crimson" : "outline"}>
                            {m.status === "active" ? "Active" : m.status === "error" ? "Needs fixing" : "Paused"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {m.sent_24h}/{m.daily_limit}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-start justify-end gap-1">
                            <MailboxDialog mailbox={m} clients={clients} />
                            <MailboxActions id={m.id} email={m.email} status={m.status} canDelete={role === "admin"} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Do not email</CardTitle>
              <CardDescription>
                Bounces and unsubscribes land here on their own. Add a domain to block a whole firm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SuppressForm />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function SenderStatus({
  running,
  heartbeat,
  sending,
}: {
  running: boolean;
  heartbeat: string | null;
  sending: boolean;
}) {
  if (running) {
    return (
      <p className="rounded-md border border-gold-700/50 bg-gold-900/10 px-4 py-3 text-sm text-gold-100">
        Sender is running. Last pass {formatDistanceToNow(new Date(heartbeat!), { addSuffix: true })}.
      </p>
    );
  }
  return (
    <div
      className={
        sending
          ? "rounded-md border border-crimson-800/60 bg-crimson-900/20 px-4 py-3 text-sm text-crimson-100"
          : "rounded-md border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-muted-foreground"
      }
    >
      <p>
        {sending ? "Campaigns are live but the sender isn't running, so nothing is going out." : "Sender is off."}{" "}
        {heartbeat && `Last seen ${formatDistanceToNow(new Date(heartbeat), { addSuffix: true })}. `}
        Start it in a terminal in the project folder and leave it open:
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded bg-ink-950 px-2 py-1 font-mono text-xs text-foreground">npm run sender</code>
        <CopyButton text="npm run sender" />
      </div>
    </div>
  );
}
