import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/clients/queries";
import { PrintButton } from "@/components/clients/print-button";
import { CadenceLogo } from "@/components/cadence-logo";
import type { RunState } from "@/lib/agents/pipelines";
import type { AgentRun, IntelCapture } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

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
  linkedin_page: "LinkedIn posts",
  website: "Website",
};

type Shot = { competitor: string; source: string; url: string; src: string };

export default async function ReportPage({ params }: { params: { id: string; runId: string } }) {
  const supabase = createClient();
  const [client, { data: run }] = await Promise.all([
    getClient(params.id),
    supabase.from("agent_runs").select("*").eq("id", params.runId).maybeSingle<AgentRun>(),
  ]);
  if (!client || !run || run.client_id !== client.id || run.kind !== "research") notFound();

  const s = (run.output ?? {}) as unknown as RunState;
  const { data: captureRows } = await supabase
    .from("intel_captures")
    .select("*")
    .eq("client_id", client.id)
    .eq("ok", true)
    .not("screenshot_path", "is", null)
    .order("captured_at", { ascending: false })
    .limit(60);

  // Newest screenshot per competitor + source.
  const seen = new Set<string>();
  const shots: Shot[] = [];
  for (const c of (captureRows ?? []) as IntelCapture[]) {
    const key = `${c.competitor.toLowerCase()}|${c.source}`;
    if (seen.has(key) || !c.screenshot_path) continue;
    seen.add(key);
    const { data: signed } = await supabase.storage.from("intel").createSignedUrl(c.screenshot_path, 60 * 60);
    if (signed?.signedUrl) shots.push({ competitor: c.competitor, source: c.source, url: c.url, src: signed.signedUrl });
  }
  const shotsFor = (name: string) => shots.filter((x) => x.competitor.toLowerCase() === name.toLowerCase());

  const r = s.report;
  const brief = s.brief;
  const pb = brief?.playbook;
  const sc = s.scripts;
  const date = new Date(run.completed_at ?? run.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const allSources = [
    ...(s.profile?.sources ?? []),
    ...(s.dives ?? []).flatMap((d) => d.sources ?? []),
    ...(brief?.sources ?? []),
  ].filter((x, i, arr) => x.url && arr.findIndex((y) => y.url === x.url) === i);

  let n = 0;
  const num = () => ++n;

  return (
    <main className="flex-1 px-4 py-6 md:px-8">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
        <Link
          href={`/clients/${client.id}?run=${run.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-crimson-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {client.name}
        </Link>
        <PrintButton />
      </div>

      <article className="report-paper mx-auto max-w-4xl rounded-lg bg-white px-8 py-10 text-[14px] leading-relaxed text-neutral-800 shadow-xl md:px-14">
        {/* Cover */}
        <header className="border-b border-neutral-200 pb-8">
          <div className="flex items-center justify-between">
            <CadenceLogo />
            <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">{date}</span>
          </div>
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.3em] text-red-600">Market analysis report</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-neutral-900">{client.name}</h1>
          <p className="mt-2 text-neutral-500">
            {client.vertical}
            {client.location ? ` · ${client.location}` : ""} · Prepared by Cadence GTM
          </p>
          {s.phase !== "done" && (
            <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This run is still in progress. Sections fill in as the agents finish.
            </p>
          )}
          {s.skipped && s.skipped.length > 0 && (
            <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Deep dive skipped after repeated failures: {s.skipped.join(", ")}.
            </p>
          )}
        </header>

        {r && (
          <Sec n={num()} title="Executive summary">
            <p className="text-[15px] text-neutral-900">{r.executive_summary}</p>
          </Sec>
        )}

        {r && (
          <Sec n={num()} title="The market">
            <p>{r.market_overview.state_of_market}</p>
            <H>Trends that change how this buyer buys</H>
            <Ul items={r.market_overview.trends} />
            <H>How they buy</H>
            <p>{r.market_overview.buying_process}</p>
          </Sec>
        )}

        {s.profile && (
          <Sec n={num()} title={`${client.name} today`}>
            <p>{s.profile.summary}</p>
            <Grid
              rows={[
                ["Niche", s.profile.niche],
                ["Size", s.profile.size_estimate],
                ["Locations", s.profile.locations],
                ["Positioning", s.profile.positioning],
                ["Services", s.profile.services.join(", ")],
              ]}
            />
            <H>Marketing today</H>
            <Table
              head={["Channel", "What we found", ""]}
              rows={s.profile.current_marketing.map((m) => [m.channel, m.observation, m.confidence])}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <H>Strengths</H>
                <Ul items={s.profile.strengths} />
              </div>
              <div>
                <H>Weaknesses</H>
                <Ul items={s.profile.weaknesses} />
              </div>
            </div>
          </Sec>
        )}

        {r && r.personas.length > 0 && (
          <Sec n={num()} title="Who we're selling to">
            <div className="grid gap-4 md:grid-cols-2">
              {r.personas.map((p, i) => (
                <div key={i} className="break-inside-avoid rounded border border-neutral-200 p-4">
                  <p className="font-display text-base font-semibold text-neutral-900">{p.name}</p>
                  <p className="text-xs text-neutral-500">
                    {p.title} · {p.firm_profile}
                  </p>
                  <H>Wants</H>
                  <Ul items={p.goals} />
                  <H>Fears</H>
                  <Ul items={p.fears} />
                  <H>Where they pay attention</H>
                  <Ul items={p.where_they_pay_attention} />
                </div>
              ))}
            </div>
          </Sec>
        )}

        {r && r.pain_points.length > 0 && (
          <Sec n={num()} title="Pain points">
            <Table
              head={["Pain", "In their words", "Cost of doing nothing", "Severity"]}
              rows={r.pain_points.map((p) => [p.pain, `"${p.in_their_words}"`, p.cost_of_inaction, p.severity])}
            />
          </Sec>
        )}

        {(s.dives?.length ?? 0) > 0 && (
          <Sec n={num()} title="Competitive landscape">
            {r && r.competitive_matrix.length > 0 && (
              <Table
                head={["Competitor", "Strongest channel", "Core promise", `Where ${client.name} wins`]}
                rows={r.competitive_matrix.map((m) => [m.competitor, m.strongest_channel, m.core_promise, m.our_edge])}
              />
            )}
            {s.dives!.map((d, i) => (
              <div key={i} className="mt-8 break-inside-avoid-page">
                <h3 className="font-display text-xl font-semibold text-neutral-900">{d.name}</h3>
                <p className="text-xs text-neutral-500">{d.website}</p>
                <p className="mt-2">{d.positioning}</p>
                <p className="mt-1 text-neutral-600">
                  <b className="text-neutral-800">Offer and pricing:</b> {d.offer_and_pricing}
                </p>
                {(d.channels ?? []).length > 0 && (
                  <Table
                    head={["Channel", "Activity", "What they do", "Evidence"]}
                    rows={(d.channels ?? []).map((c) => [
                      CHANNEL_LABEL[c.channel] ?? c.channel,
                      c.activity.replace("_", " "),
                      c.what_they_do,
                      `${c.confidence}: ${c.evidence}`,
                    ])}
                  />
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <H>What's working</H>
                    <Ul items={d.whats_working ?? []} />
                  </div>
                  <div>
                    <H>Where they're weak</H>
                    <Ul items={d.weaknesses ?? []} />
                  </div>
                </div>
                {shotsFor(d.name).length > 0 && (
                  <>
                    <H>Screenshots</H>
                    <div className="grid gap-4 md:grid-cols-2">
                      {shotsFor(d.name).map((x, j) => (
                        <figure key={j} className="break-inside-avoid overflow-hidden rounded border border-neutral-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={x.src} alt={`${d.name} ${x.source}`} className="max-h-[520px] w-full object-cover object-top" />
                          <figcaption className="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-500">
                            {CHANNEL_LABEL[x.source] ?? x.source} · {x.url.slice(0, 90)}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </Sec>
        )}

        {r && (
          <Sec n={num()} title="Positioning and messaging">
            <Grid
              rows={[
                ["Market awareness", r.messaging.awareness_level],
                ["Positioning", r.messaging.positioning_statement],
                ["Core message", r.messaging.core_message],
              ]}
            />
            <H>Proof we lead with</H>
            <Ul items={r.messaging.proof_points} />
            <H>Message by persona</H>
            <Table head={["Persona", "What we say"]} rows={r.messaging.by_persona.map((m) => [m.persona, m.message])} />
          </Sec>
        )}

        {r && r.strategic_rationale.length > 0 && (
          <Sec n={num()} title="Why this strategy works">
            <Table
              head={["Principle", "Why it applies here", "Where it shows up"]}
              rows={r.strategic_rationale.map((x) => [x.principle, x.why_it_applies, x.how_we_use_it])}
            />
          </Sec>
        )}

        {pb && (
          <Sec n={num()} title="The playbook">
            <p className="text-[15px] text-neutral-900">{pb.summary}</p>
            <H>Plays we're replicating</H>
            <Table
              head={["Play", "Channel", "From", "Our version"]}
              rows={pb.replicate.map((p) => [p.what, p.channel, p.from_competitor, p.how_we_adapt])}
            />
            <H>Gaps nobody is covering</H>
            <Ul items={pb.gaps_to_exploit} />
            <H>Channel plan</H>
            <Table
              head={["Channel", "Priority", "Why", "First moves"]}
              rows={[...pb.channel_plan]
                .sort((a, b) => a.priority - b.priority)
                .map((c) => [
                  c.channel,
                  c.priority === 1 ? "Start now" : c.priority === 2 ? "Next 60 days" : "Later",
                  c.why,
                  c.first_actions.join(" · "),
                ])}
            />
            <H>First 30 days</H>
            <ol className="list-decimal space-y-1 pl-5">
              {pb.first_30_days.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ol>
          </Sec>
        )}

        {brief && brief.angles.length > 0 && (
          <Sec n={num()} title="Outbound angles">
            <Table
              head={["Angle", "Hook", "Why it lands", "Proof needed"]}
              rows={brief.angles.map((a) => [a.name, `"${a.hook}"`, a.why_it_works, a.proof_needed])}
            />
            <H>Objections and how to handle them</H>
            <Table head={["They say", "We say"]} rows={brief.objections.map((o) => [`"${o.objection}"`, o.response])} />
          </Sec>
        )}

        {sc && (
          <Sec n={num()} title="Scripts">
            <h3 className="mt-2 font-display text-lg font-semibold text-neutral-900">Cold call</h3>
            <Script label="Opener" text={sc.cold_call.opener} />
            <Script label="Reason for the call" text={sc.cold_call.reason_for_call} />
            <H>Discovery questions</H>
            <Ul items={sc.cold_call.discovery_questions} />
            <Script label="Pitch" text={sc.cold_call.pitch} />
            <H>Objections</H>
            <Table head={["They say", "You say"]} rows={sc.cold_call.objections.map((o) => [`"${o.objection}"`, o.response])} />
            <Script label="Close" text={sc.cold_call.close} />

            <h3 className="mt-8 font-display text-lg font-semibold text-neutral-900">LinkedIn DMs</h3>
            {sc.linkedin_dms.map((d) => (
              <Script key={d.step} label={`Step ${d.step} · ${d.when}`} text={d.message} />
            ))}

            <h3 className="mt-8 font-display text-lg font-semibold text-neutral-900">Meta ads</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {sc.meta_ads.map((a, i) => (
                <div key={i} className="break-inside-avoid rounded border border-neutral-200 p-3 text-[13px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-600">{a.angle}</p>
                  <p className="mt-2 whitespace-pre-wrap">{a.primary_text}</p>
                  <p className="mt-2 font-semibold text-neutral-900">{a.headline}</p>
                  <p className="text-xs text-neutral-500">CTA: {a.cta}</p>
                  <p className="mt-2 text-xs italic text-neutral-500">Visual: {a.visual_direction}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-8 font-display text-lg font-semibold text-neutral-900">Video ad (30 to 45s)</h3>
            <Script label="Hook" text={sc.video_ad.hook} />
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {sc.video_ad.beats.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            <Script label="CTA" text={sc.video_ad.cta} />

            <h3 className="mt-8 font-display text-lg font-semibold text-neutral-900">Sales call talk track</h3>
            <Script label="Agenda" text={sc.sales_call.agenda} />
            <H>Discovery</H>
            <Ul items={sc.sales_call.discovery_questions} />
            <Script label="Pitch framing" text={sc.sales_call.pitch_framing} />
            <Script label="Close" text={sc.sales_call.close} />
          </Sec>
        )}

        {r && (r.kpis.length > 0 || r.risks.length > 0) && (
          <Sec n={num()} title="How we'll measure it">
            <Table head={["Metric", "Target", "By when"]} rows={r.kpis.map((k) => [k.metric, k.target, k.timeframe])} />
            <H>Risks</H>
            <Table head={["Risk", "What we do about it"]} rows={r.risks.map((k) => [k.risk, k.mitigation])} />
          </Sec>
        )}

        {allSources.length > 0 && (
          <Sec n={num()} title="Sources">
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-neutral-500">
              {allSources.map((x, i) => (
                <li key={i}>
                  {x.title ? `${x.title}. ` : ""}
                  <a href={x.url} className="underline">
                    {x.url}
                  </a>
                </li>
              ))}
            </ol>
          </Sec>
        )}
      </article>
    </main>
  );
}

function Sec({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 break-inside-avoid-page">
      <h2 className="flex items-baseline gap-3 border-b border-neutral-200 pb-2 font-display text-2xl font-semibold tracking-tight text-neutral-900">
        <span className="text-sm font-semibold text-red-600">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="pt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{children}</h4>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">{k}</dt>
          <dd className="text-neutral-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-neutral-300">
            {head.map((h, i) => (
              <th key={i} className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid border-b border-neutral-100 align-top">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "py-2 pr-3 font-medium text-neutral-900" : "py-2 pr-3"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Script({ label, text }: { label: string; text: string }) {
  return (
    <div className="break-inside-avoid border-l-2 border-red-600 pl-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="whitespace-pre-wrap text-neutral-900">{text}</p>
    </div>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const client = await getClient(params.id);
  return { title: `${client?.name ?? "Client"} market analysis · Cadence GTM` };
}
