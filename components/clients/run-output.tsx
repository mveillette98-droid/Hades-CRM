import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import type { CriticRound, RunState } from "@/lib/agents/pipelines";
import type { ContentPack, EmailCampaign, ResearchBrief } from "@/lib/agents/schemas";
import type { AgentRun } from "@/lib/supabase/types";

export function RunOutput({ run }: { run: AgentRun }) {
  const state = (run.output ?? {}) as unknown as RunState;

  if (run.kind === "research") {
    return state.brief ? <ResearchView brief={state.brief} /> : <Empty />;
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
