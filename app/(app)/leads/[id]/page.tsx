import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Mail, Phone } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LeadSheet } from "@/components/leads/lead-sheet";
import { DealTypeIcon } from "@/components/leads/deal-type-icon";
import { StageBadge } from "@/components/leads/stage-badge";
import { AddNoteForm } from "@/components/leads/add-note-form";
import { DeleteLeadButton } from "@/components/leads/delete-lead-button";
import {
  getLead,
  listActivities,
  listStages,
  listTeam,
  currentRole,
} from "@/lib/leads/queries";
import { DEAL_TYPE_LABEL, LEAD_SOURCE_LABEL } from "@/lib/leads/labels";
import { formatCompactCurrency, formatCurrency, daysBetween } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [lead, stages, team, activities, role] = await Promise.all([
    getLead(params.id),
    listStages(),
    listTeam(),
    listActivities(params.id),
    currentRole(),
  ]);

  if (!lead) notFound();

  const daysInStage = daysBetween(lead.updated_at);

  return (
    <>
      <TopBar title={lead.company_name} />
      <main className="flex-1 space-y-6 px-8 py-8">
        {/* Back + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-crimson-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All leads
          </Link>
          <div className="flex items-center gap-2">
            <LeadSheet
              mode="edit"
              lead={lead}
              stages={stages}
              team={team}
              triggerVariant="outline"
            />
            {role === "admin" && (
              <DeleteLeadButton
                leadId={lead.id}
                company={lead.company_name}
                redirectTo="/leads"
              />
            )}
          </div>
        </div>

        {/* Header */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <DealTypeIcon type={lead.deal_type} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {DEAL_TYPE_LABEL[lead.deal_type]} · {LEAD_SOURCE_LABEL[lead.source]}
                </span>
              </div>
              <CardTitle className="text-2xl">{lead.company_name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span>{lead.contact_name}</span>
                <StageBadge stage={lead.stage} />
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                Total contract
              </p>
              <p className="font-display text-3xl font-bold text-gold-300">
                {formatCompactCurrency(Number(lead.total_contract_value ?? 0))}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(Number(lead.one_time_value))} one-time
                {" · "}
                {formatCurrency(Number(lead.monthly_recurring_value))}/mo
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Separator className="mb-5" />
            <dl className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
              <ContactItem icon={Phone} label="Phone" value={lead.phone} />
              <ContactItem icon={Mail} label="Email" value={lead.email} />
              <ContactItem
                icon={Globe}
                label="Website"
                value={lead.website_url}
                href={lead.website_url || undefined}
              />
              <Detail label="Assigned to" value={lead.assignee?.full_name || lead.assignee?.email || "—"} />
              <Detail label="Next follow-up" value={fmtDate(lead.next_followup_date)} />
              <Detail label="Proposal sent" value={fmtDate(lead.proposal_sent_date)} />
              <Detail label="Expected close" value={fmtDate(lead.expected_close_date)} />
              <Detail label="Actual close" value={fmtDate(lead.actual_close_date)} />
            </dl>
            {lead.scope_notes && (
              <>
                <Separator className="my-5" />
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Scope
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {lead.scope_notes}
                  </p>
                </div>
              </>
            )}
            <Separator className="my-5" />
            <p className="text-xs text-muted-foreground">
              {daysInStage === 0
                ? "Updated today."
                : `${daysInStage} day${daysInStage === 1 ? "" : "s"} since last update.`}
            </p>
          </CardContent>
        </Card>

        {/* Activity log */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Every edit, stage change, and note — stamped with who and when.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddNoteForm leadId={lead.id} />
              <Separator />
              {activities.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing logged yet.
                </p>
              ) : (
                <ol className="space-y-4">
                  {activities.map((a) => (
                    <ActivityRow key={a.id} activity={a} stages={stages} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sidebar</CardTitle>
              <CardDescription>
                Reminders to keep this deal moving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Reminder
                label="Next follow-up"
                value={fmtDate(lead.next_followup_date)}
                warn={isOverdue(lead.next_followup_date)}
                warnText="Overdue — call them."
              />
              <Reminder
                label="Proposal sent"
                value={fmtDate(lead.proposal_sent_date)}
              />
              <Reminder
                label="Days since touch"
                value={`${daysInStage} day${daysInStage === 1 ? "" : "s"}`}
                warn={daysInStage >= 7}
                warnText="Stale. Move it or close it."
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string;
}) {
  const content = (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {value || "—"}
    </span>
  );
  return (
    <div>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd>
        {value && href ? (
          <a
            href={href.startsWith("http") ? href : `https://${href}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-crimson-400"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Reminder({
  label,
  value,
  warn,
  warnText,
}: {
  label: string;
  value: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-ink-700 bg-ink-900 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
      {warn && warnText && (
        <span className="shrink-0 rounded-full border border-crimson-800/60 bg-crimson-900/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crimson-300">
          {warnText}
        </span>
      )}
    </div>
  );
}

function ActivityRow({
  activity,
  stages,
}: {
  activity: Awaited<ReturnType<typeof listActivities>>[number];
  stages: Awaited<ReturnType<typeof listStages>>;
}) {
  const stageName = (id?: string | null) =>
    id ? stages.find((s) => s.id === id)?.name ?? id : "—";

  const who =
    activity.user?.full_name || activity.user?.email || "Someone";
  const when = new Date(activity.created_at);
  const whenLabel =
    when.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  let body: React.ReactNode = null;
  const details = (activity.details ?? {}) as Record<string, unknown>;

  if (activity.action === "note.added" && typeof details.note === "string") {
    body = (
      <p className="mt-1 whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-900 p-3 text-sm text-foreground">
        {details.note}
      </p>
    );
  } else if (activity.action === "lead.stage_changed") {
    body = (
      <p className="mt-1 text-sm text-muted-foreground">
        {stageName(details.from as string | null)} →{" "}
        <span className="font-medium text-crimson-400">
          {stageName(details.to as string | null)}
        </span>
      </p>
    );
  } else if (activity.action === "lead.created") {
    body = (
      <p className="mt-1 text-sm text-muted-foreground">
        {String(details.company ?? "")}
        {details.deal_type ? ` · ${details.deal_type}` : ""}
        {details.source ? ` · ${details.source}` : ""}
      </p>
    );
  } else if (activity.action === "lead.updated") {
    const keys = Object.keys(details);
    body = (
      <p className="mt-1 text-sm text-muted-foreground">
        Updated {keys.length} field{keys.length === 1 ? "" : "s"}:{" "}
        <span className="text-foreground">{keys.join(", ")}</span>
      </p>
    );
  }

  return (
    <li className="flex gap-3">
      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-crimson-500" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{who}</span> ·{" "}
          {labelFor(activity.action)} · {whenLabel}
        </p>
        {body}
      </div>
    </li>
  );
}

function labelFor(action: string) {
  switch (action) {
    case "lead.created": return "created the lead";
    case "lead.stage_changed": return "moved stage";
    case "lead.updated": return "edited the lead";
    case "note.added": return "added a note";
    default: return action;
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}
