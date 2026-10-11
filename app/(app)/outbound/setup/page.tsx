import { formatDistanceToNow } from "date-fns";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/clients/copy-button";
import { OutboundTabs } from "@/components/outbound/outbound-tabs";
import { DomainCheckButton } from "@/components/outbound/domain-check-button";
import { WarmupInput } from "@/components/outbound/warmup-input";
import { MailboxDialog } from "@/components/outbound/mailbox-dialog";
import { MailboxActions } from "@/components/outbound/mailbox-actions";
import { StatusIcon } from "@/components/outbound/status-icon";
import { listDomainChecks, listMailboxes } from "@/lib/outbound/queries";
import { emailDomain } from "@/lib/outbound/classify";
import { isWarm, warmupDays } from "@/lib/outbound/readiness";
import { currentRole } from "@/lib/leads/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Outbound setup · Cadence GTM" };
export const dynamic = "force-dynamic";

const STEPS = [
  "Buy a look-alike domain for each client (getwhitfieldcpa.com, not whitfieldcpa.com). 2 to 3 inboxes per domain, never more.",
  "Add it to Google Workspace and create the inboxes under real-sounding names.",
  "Point the bare domain at the client's real website, so anyone who checks lands somewhere real.",
  "Add the MX, SPF, DKIM and DMARC records. The check below tells you exactly what's missing.",
  "Turn on 2-step verification for each inbox, create an app password, and add the inbox here.",
  "Connect every inbox to a warmup service and enter the start date below. The sender won't use an inbox until it has 14 days of warmup behind it.",
];

export default async function OutboundSetupPage() {
  const supabase = createClient();
  const [mailboxes, checks, role, { data: clientRows }] = await Promise.all([
    listMailboxes(),
    listDomainChecks(),
    currentRole(),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  const clients = (clientRows ?? []) as { id: string; name: string }[];
  const byDomain = new Map(checks.map((c) => [c.domain, c]));
  const domains = Array.from(new Set(mailboxes.map((m) => emailDomain(m.email)))).sort();
  const inboxesByDomain = (d: string) => mailboxes.filter((m) => emailDomain(m.email) === d);

  const issues =
    domains.filter((d) => !byDomain.get(d)?.ok).length +
    mailboxes.filter((m) => m.status !== "active" || !m.verified_at || !isWarm(m)).length;

  return (
    <>
      <TopBar title="Outbound" />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {domains.length} domains · {mailboxes.length} inboxes · {issues === 0 ? "all clear" : `${issues} to fix`}
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Setup</h2>
          </div>
          <OutboundTabs active="/outbound/setup" setupIssues={issues} />
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Sending domains</CardTitle>
              <CardDescription>
                Gmail and Outlook check these records on every email. One missing record is enough to land in spam.
              </CardDescription>
            </div>
            {domains.length > 0 && <DomainCheckButton />}
          </CardHeader>
          <CardContent className="space-y-4">
            {domains.length === 0 && <p className="text-sm text-muted-foreground">Add an inbox below and its domain shows up here.</p>}
            {domains.map((d) => {
              const c = byDomain.get(d);
              return (
                <div key={d} className="rounded-md border border-ink-700 bg-ink-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={!c ? "warn" : c.ok ? "pass" : "fail"} />
                      <p className="font-medium">{d}</p>
                      <span className="text-xs text-muted-foreground">
                        {inboxesByDomain(d).length} {inboxesByDomain(d).length === 1 ? "inbox" : "inboxes"}
                        {c && ` · checked ${formatDistanceToNow(new Date(c.checked_at), { addSuffix: true })}`}
                      </span>
                    </div>
                    <DomainCheckButton domain={d} label={c ? "Check again" : "Check now"} />
                  </div>
                  {!c ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">Not checked yet.</p>
                  ) : (
                    <ul className="divide-y divide-ink-700">
                      {c.results.checks.map((k) => (
                        <li key={k.key} className="flex gap-2.5 px-4 py-2.5">
                          <StatusIcon status={k.status} />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-medium leading-tight">{k.label}</p>
                            <p className="break-words text-xs text-muted-foreground">{k.detail}</p>
                            {k.fix && k.status !== "pass" && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 rounded bg-ink-950 px-2 py-1.5 font-mono text-xs">
                                <span className="text-muted-foreground">{k.fix.type}</span>
                                <span>{k.fix.host}</span>
                                <span className="min-w-0 flex-1 break-all text-foreground">{k.fix.value}</span>
                                {!k.fix.value.includes("<") && !k.fix.value.startsWith("the ") && <CopyButton text={k.fix.value} />}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Inboxes</CardTitle>
              <CardDescription>An inbox sends only when its login works and it has 14 days of warmup behind it.</CardDescription>
            </div>
            <MailboxDialog clients={clients} />
          </CardHeader>
          <CardContent>
            {mailboxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inboxes yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inbox</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Warmup started</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mailboxes.map((m) => {
                    const days = warmupDays(m.warmup_started_on);
                    const warm = isWarm(m);
                    const ready = m.status === "active" && !!m.verified_at && warm;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <p className="font-medium">{m.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.daily_limit}/day{m.client_name && ` · ${m.client_name}`}
                          </p>
                          {m.last_error && <p className="mt-1 max-w-xs text-xs text-crimson-300">{m.last_error}</p>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.status === "error" ? (
                            <span className="text-crimson-300">Broken</span>
                          ) : m.verified_at ? (
                            <span className="text-muted-foreground">
                              Tested {formatDistanceToNow(new Date(m.verified_at), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-crimson-300">Not tested</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <WarmupInput mailboxId={m.id} value={m.warmup_started_on} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {days === null ? "Not started" : warm ? `${days} days, warm` : `${days} of ${m.warmup_min_days} days`}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ready ? "gold" : m.status === "paused" ? "outline" : "crimson"}>
                            {ready ? "Ready" : m.status === "paused" ? "Paused" : "Not yet"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-start justify-end gap-1">
                            <MailboxDialog mailbox={m} clients={clients} />
                            <MailboxActions id={m.id} email={m.email} status={m.status} canDelete={role === "admin"} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New sending domain, start to finish</CardTitle>
            <CardDescription>About 30 minutes of setup per domain, then 2 weeks of warmup.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground/90">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
