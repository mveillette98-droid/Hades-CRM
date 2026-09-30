import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import type { CriticRound, RunState } from "@/lib/agents/pipelines";
import type {
  ActivityLevel,
  CompanyProfile,
  CompetitorDive,
  ContentPack,
  EmailCampaign,
  Playbook,
  ResearchBrief,
} from "@/lib/agents/schemas";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/lib/supabase/types";

export function RunOutput({ run }: { run: AgentRun }) {
  const state = (run.output ?? {}) as unknown as RunState;

  if (run.kind === "research") {
    const any = state.brief || state.profile || state.dives?.length;
    if (!any) return <Empty />;
    return (
      <div className="space-y-10">
        {state.brief?.playbook && <PlaybookView playbook={state.brief.playbook} />}
        {state.profile && <ProfileView profile={state.profile} />}
        {state.dives && state.dives.length > 0 && (
          <DivesView dives={state.dives} total={state.competitors?.length ?? state.dives.length} />
        )}
        {state.brief && <ResearchView brief={state.brief} />}
      </div>
    );
  }
  if (!state.draft) return <Empty />;
  return (
    <div className="space-y-6">
      <CriticSummary rounds={state.rounds ?? []} />
      {run.kind === "cold_email" ? (
        <CampaignView campaign={state.draft as EmailCampaign} />
      ) : (
        <ContentView pack={state.draft as ContentPack} />
      )}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">No output yet.</p>;
}

// ---------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------
function ResearchView({ brief }: { brief: ResearchBrief }) {
  return (
    <Section title="Research brief (what the writers use)">
    <div className="space-y-6 text-sm">
      <Block title="Market">
        <p className="leading-relaxed text-foreground/90">{brief.market_summary}</p>
      </Block>

      <Block title="Ideal client">
        <p className="leading-relaxed text-foreground/90">{brief.icp.firmographics}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Pills label="Buyer titles" items={brief.icp.buyer_titles} />
          <Pills label="Buying triggers" items={brief.icp.buying_triggers} />
        </div>
      </Block>

      <Block title="Angles" accent="gold">
        <div className="grid gap-3 md:grid-cols-2">
          {brief.angles.map((a, i) => (
            <div key={i} className="rounded-md border border-ink-700 bg-ink-900 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                {i + 1}. {a.name}
              </p>
              <p className="mt-2 font-medium text-foreground">&ldquo;{a.hook}&rdquo;</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{a.why_it_works}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="text-foreground/80">Proof needed:</span> {a.proof_needed}
              </p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Pain points">
        <ol className="space-y-2">
          {brief.pain_points.map((p, i) => (
            <li key={i} className="rounded-md border border-ink-700 bg-ink-900 px-4 py-3">
              <p className="font-medium text-foreground">{p.pain}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.evidence}</p>
            </li>
          ))}
        </ol>
      </Block>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Objections">
          <ul className="space-y-2">
            {brief.objections.map((o, i) => (
              <li key={i}>
                <p className="font-medium text-foreground">&ldquo;{o.objection}&rdquo;</p>
                <p className="text-xs text-muted-foreground">{o.response}</p>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Competitors">
          <ul className="space-y-2">
            {brief.competitors.map((c, i) => (
              <li key={i}>
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.positioning}</p>
                <p className="text-xs text-crimson-300">Gap: {c.gap}</p>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      {brief.sources.length > 0 && (
        <Block title="Sources">
          <ul className="space-y-1">
            {brief.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-crimson-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
    </Section>
  );
}

// ---------------------------------------------------------------------
// Onboarding: playbook, client profile, competitor dives
// ---------------------------------------------------------------------
function PlaybookView({ playbook }: { playbook: Playbook }) {
  const plan = [...playbook.channel_plan].sort((a, b) => a.priority - b.priority);
  return (
    <Section title="Replication playbook" accent="gold">
      <p className="rounded-md border border-gold-700/40 bg-gold-900/10 px-4 py-3 text-sm leading-relaxed text-gold-100">
        {playbook.summary}
      </p>

      <Block title="Plays to replicate" accent="gold">
        <div className="grid gap-3 md:grid-cols-2">
          {playbook.replicate.map((r, i) => (
            <div key={i} className="rounded-md border border-ink-700 bg-ink-900 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{r.channel}</Badge>
                <span className="text-xs text-muted-foreground">from {r.from_competitor}</span>
              </div>
              <p className="mt-2 font-medium text-foreground">{r.what}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">Our version:</span> {r.how_we_adapt}
              </p>
            </div>
          ))}
        </div>
      </Block>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Channel plan">
          <ol className="space-y-3">
            {plan.map((c, i) => (
              <li key={i} className="rounded-md border border-ink-700 bg-ink-900 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{c.channel}</p>
                  <Badge variant={c.priority === 1 ? "crimson" : c.priority === 2 ? "gold" : "outline"}>
                    {c.priority === 1 ? "Start now" : c.priority === 2 ? "Next 60 days" : "Later"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.why}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-foreground/85">
                  {c.first_actions.map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Block>
        <div className="space-y-6">
          <Block title="Gaps nobody is covering">
            <ul className="list-disc space-y-1 pl-4 text-sm text-foreground/90">
              {playbook.gaps_to_exploit.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </Block>
          <Block title="First 30 days">
            <ol className="list-decimal space-y-1 pl-4 text-sm text-foreground/90">
              {playbook.first_30_days.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ol>
          </Block>
        </div>
      </div>
    </Section>
  );
}

function ProfileView({ profile }: { profile: CompanyProfile }) {
  return (
    <Section title="Client profile">
      <p className="text-sm leading-relaxed text-foreground/90">{profile.summary}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Niche" value={profile.niche} />
        <Fact label="Size" value={profile.size_estimate} />
        <Fact label="Locations" value={profile.locations} />
        <Fact label="Positioning" value={profile.positioning} />
      </dl>
      <Pills label="Services" items={profile.services} />
      <Block title="Marketing today">
        <ul className="space-y-2 text-sm">
          {profile.current_marketing.map((m, i) => (
            <li key={i} className="flex gap-3">
              <ConfidenceTag c={m.confidence} />
              <span>
                <span className="font-medium text-foreground">{m.channel}:</span>{" "}
                <span className="text-foreground/85">{m.observation}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>
      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Strengths">
          <ul className="list-disc space-y-1 pl-4 text-sm text-foreground/90">
            {profile.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Block>
        <Block title="Weaknesses">
          <ul className="list-disc space-y-1 pl-4 text-sm text-foreground/90">
            {profile.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Block>
      </div>
      <SourceList sources={profile.sources} />
    </Section>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  meta_ads: "Meta ads",
  linkedin_organic: "LinkedIn organic",
  linkedin_ads: "LinkedIn ads",
  google_ads: "Google ads",
  seo_content: "SEO / content",
  cold_outbound: "Cold outbound",
  email_newsletter: "Newsletter",
  events_webinars: "Events / webinars",
  partnerships_referrals: "Partners / referrals",
  reviews_directories: "Reviews / directories",
};

const ACTIVITY_STYLE: Record<ActivityLevel, string> = {
  heavy: "border-crimson-700/60 bg-crimson-900/30 text-crimson-200",
  moderate: "border-gold-700/50 bg-gold-900/20 text-gold-200",
  light: "border-ink-600 bg-ink-800 text-foreground/80",
  none_found: "border-ink-700 bg-transparent text-muted-foreground",
  unknown: "border-dashed border-ink-600 bg-transparent text-muted-foreground",
};

function DivesView({ dives, total }: { dives: CompetitorDive[]; total: number }) {
  return (
    <Section title={`Competitor deep dives (${dives.length} of ${total})`}>
      <div className="space-y-4">
        {dives.map((d, i) => (
          <details key={i} open={i === 0} className="group rounded-md border border-ink-700 bg-ink-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-display font-semibold text-foreground">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">{d.positioning}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {d.channels
                  .filter((c) => c.activity === "heavy" || c.activity === "moderate")
                  .map((c) => (
                    <span
                      key={c.channel}
                      className={cn("rounded-full border px-2 py-0.5 text-[10px]", ACTIVITY_STYLE[c.activity])}
                    >
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                    </span>
                  ))}
              </div>
            </summary>
            <div className="space-y-5 border-t border-ink-700 px-4 py-4 text-sm">
              <Fact label="Offer and pricing" value={d.offer_and_pricing} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Channel</th>
                      <th className="py-2 pr-3 font-semibold">Activity</th>
                      <th className="py-2 pr-3 font-semibold">What they do</th>
                      <th className="py-2 font-semibold">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700">
                    {d.channels.map((c) => (
                      <tr key={c.channel} className="align-top">
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {CHANNEL_LABEL[c.channel] ?? c.channel}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px]", ACTIVITY_STYLE[c.activity])}>
                            {c.activity.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-foreground/85">{c.what_they_do}</td>
                        <td className="py-2 text-muted-foreground">
                          <ConfidenceTag c={c.confidence} /> {c.evidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Block title="What's working" accent="gold">
                  <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                    {d.whats_working.map((w, j) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                </Block>
                <Block title="Where they're weak">
                  <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                    {d.weaknesses.map((w, j) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                </Block>
              </div>
              <SourceList sources={d.sources} />
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

function ConfidenceTag({ c }: { c: "observed" | "inferred" }) {
  return (
    <span
      className={cn(
        "mr-1 inline-block shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider",
        c === "observed" ? "bg-emerald-900/40 text-emerald-300" : "bg-ink-800 text-muted-foreground"
      )}
      title={c === "observed" ? "Seen in a source" : "Read from indirect signals"}
    >
      {c}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground/90">{value}</dd>
    </div>
  );
}

function SourceList({ sources }: { sources: { title: string; url: string }[] }) {
  if (sources.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </summary>
      <ul className="mt-2 space-y-1">
        {sources.map((s, i) => (
          <li key={i}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-crimson-400"
            >
              <ExternalLink className="h-3 w-3" />
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: "gold";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <h3
        className={cn(
          "font-display text-lg font-semibold tracking-tight",
          accent === "gold" ? "text-gold-300" : "text-foreground"
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Critic
// ---------------------------------------------------------------------
function CriticSummary({ rounds }: { rounds: CriticRound[] }) {
  if (rounds.length === 0) return null;
  const last = rounds[rounds.length - 1]!;
  const passed = last.score >= 8;
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            passed
              ? "font-display text-2xl font-bold text-gold-300"
              : "font-display text-2xl font-bold text-crimson-400"
          }
        >
          {last.score}/10
        </span>
        <Badge variant={passed ? "gold" : "crimson"}>{passed ? "Critic: ship it" : "Critic: needs work"}</Badge>
        <span className="text-xs text-muted-foreground">
          {rounds.length} critic {rounds.length === 1 ? "round" : "rounds"}
          {rounds.length > 1 && ` · ${rounds.map((r) => r.score).join(" → ")}`}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground/90">{last.summary}</p>
      {last.issues.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {last.issues.length} open {last.issues.length === 1 ? "note" : "notes"} from the critic
          </summary>
          <ul className="mt-2 space-y-2">
            {last.issues.map((i, n) => (
              <li key={n} className="text-xs">
                <span className="text-crimson-300">{i.location}:</span>{" "}
                <span className="text-foreground/90">{i.problem}</span>{" "}
                <span className="text-muted-foreground">Fix: {i.fix}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Cold email
// ---------------------------------------------------------------------
function CampaignView({ campaign }: { campaign: EmailCampaign }) {
  return (
    <div className="space-y-6">
      {campaign.sequences.map((seq, i) => {
        const all = seq.emails
          .map((e) => `Day ${e.send_day}\nSubject: ${e.subject}\n\n${e.body}`)
          .join("\n\n---\n\n");
        return (
          <Block
            key={i}
            title={`Sequence ${i + 1}: ${seq.angle}`}
            accent="gold"
            action={<CopyButton text={all} label="Copy sequence" />}
          >
            <p className="mb-3 text-xs text-muted-foreground">To: {seq.audience}</p>
            <div className="space-y-3">
              {seq.emails.map((e) => (
                <div key={e.step} className="rounded-md border border-ink-700 bg-ink-900">
                  <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-4 py-2">
                    <p className="text-xs">
                      <span className="text-muted-foreground">
                        Email {e.step} · Day {e.send_day} ·{" "}
                      </span>
                      <span className="font-medium text-foreground">{e.subject}</span>
                    </p>
                    <CopyButton text={`Subject: ${e.subject}\n\n${e.body}`} />
                  </div>
                  <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-foreground/90">
                    {e.body}
                  </p>
                </div>
              ))}
            </div>
          </Block>
        );
      })}
      <Block title="Personalization">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {campaign.personalization_notes}
        </p>
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------------
// LinkedIn content
// ---------------------------------------------------------------------
function ContentView({ pack }: { pack: ContentPack }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pack.posts.map((p, i) => {
        const full = `${p.hook}\n\n${p.body}\n\n${p.cta}`;
        return (
          <div key={i} className="flex flex-col rounded-md border border-ink-700 bg-ink-900">
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Post {i + 1}</span>
                <Badge variant="outline">{p.format.replace("_", " ")}</Badge>
              </div>
              <CopyButton text={full} />
            </div>
            <div className="flex-1 space-y-3 px-4 py-3 text-sm leading-relaxed">
              <p className="font-medium text-foreground">{p.hook}</p>
              <p className="whitespace-pre-wrap text-foreground/85">{p.body}</p>
              <p className="text-gold-300">{p.cta}</p>
            </div>
            <p className="border-t border-ink-700 px-4 py-2 text-[11px] text-muted-foreground">
              Angle: {p.angle}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------
function Block({
  title,
  accent,
  action,
  children,
}: {
  title: string;
  accent?: "gold";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          <span className={accent === "gold" ? "h-px w-6 bg-gold-500/70" : "h-px w-6 bg-crimson-500/70"} />
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Pills({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span key={i} className="rounded-full border border-ink-700 bg-ink-900 px-2.5 py-0.5 text-xs text-foreground/90">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
