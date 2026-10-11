import "server-only";
import type { AgentKind, Client } from "@/lib/supabase/types";
import { runStructured, type Usage } from "./claude";
import {
  CONTENT_SYSTEM,
  COLD_EMAIL_SYSTEM,
  CRITIC_SYSTEM,
  COMPETITOR_DIVE_SYSTEM,
  COMPETITOR_PICK_SYSTEM,
  PROFILE_SYSTEM,
  REPORT_SYSTEM,
  SCRIPTS_SYSTEM,
  STRATEGY_SYSTEM,
  clientBrief,
  operatorNotes,
} from "./prompts";
import {
  companyProfileSchema,
  competitorDiveSchema,
  competitorListSchema,
  contentPackSchema,
  critiqueSchema,
  emailCampaignSchema,
  marketReportSchema,
  researchSchema,
  scriptsSchema,
  type CompanyProfile,
  type CompetitorDive,
  type CompetitorList,
  type Critique,
  type MarketReport,
  type ResearchBrief,
  type Scripts,
} from "./schemas";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * The agent team as a resumable state machine.
 *
 *   research:           Research agent:  profile → competitors → [capture] → dive ×3
 *                       Strategy agent:  strategy → report → scripts → done
 *   cold_email/content: write → critique ⇄ revise → done
 *
 * Every call to `advance` runs exactly one agent and returns the new state,
 * so each HTTP request stays well under serverless time limits and a run
 * that gets interrupted can pick up where it left off.
 */

export const SHIP_SCORE = 8;
export const MAX_REVISIONS = 2;

export type Phase =
  | "profile"
  | "competitors"
  | "capture"
  | "dive"
  | "strategy"
  | "report"
  | "scripts"
  | "write"
  | "critique"
  | "revise"
  | "done";

export interface CriticRound {
  round: number;
  score: number;
  verdict: Critique["verdict"];
  summary: string;
  issues: Critique["issues"];
}

export interface RunState {
  phase: Phase;
  research_run_id?: string;
  /** research runs: client profile, competitor picks, one dive per competitor */
  profile?: CompanyProfile;
  competitors?: CompetitorList["competitors"];
  dives?: CompetitorDive[];
  /** research runs: pause after picking competitors so Chrome capture can run */
  wait_for_capture?: boolean;
  /** research runs: the synthesized brief + playbook the writers use */
  brief?: ResearchBrief;
  /** research runs: market analysis report */
  report?: MarketReport;
  scripts?: Scripts;
  /** consecutive failures on the current step */
  failures?: number;
  /** competitors whose dive was skipped after repeated failures */
  skipped?: string[];
  /** writer draft (cold_email / content runs) */
  draft?: unknown;
  rounds?: CriticRound[];
  final_score?: number;
}

export interface CaptureForAgent {
  source: string;
  url: string;
  text: string | null;
  imageUrl: string | null;
}

export interface AdvanceInput {
  kind: AgentKind;
  state: RunState;
  client: Client;
  research: ResearchBrief | null;
  instructions: string | null;
  usage: Usage;
  /** Chrome captures for one competitor (research dives). */
  loadCaptures?: (competitor: string) => Promise<CaptureForAgent[]>;
}

export function initialState(
  kind: AgentKind,
  researchRunId?: string,
  waitForCapture = false
): RunState {
  return kind === "research"
    ? { phase: "profile", dives: [], wait_for_capture: waitForCapture }
    : { phase: "write", research_run_id: researchRunId, rounds: [] };
}

/** Label for the step that `advance` is about to run. */
export function pendingStepLabel(kind: AgentKind, state: RunState): string {
  const what = kind === "content" ? "LinkedIn posts" : "cold email sequences";
  switch (state.phase) {
    case "profile":
      return "Research agent: profiling the client";
    case "competitors":
      return "Research agent: picking the top 3 competitors";
    case "dive": {
      const i = state.dives?.length ?? 0;
      const name = state.competitors?.[i]?.name ?? "competitor";
      return `Research agent: deep dive on ${name} (${i + 1} of ${state.competitors?.length ?? 3})`;
    }
    case "capture":
      return "Waiting for Chrome capture";
    case "strategy":
      return "Strategy agent: building the playbook";
    case "report":
      return "Strategy agent: writing the market report";
    case "scripts":
      return "Strategy agent: writing the scripts";
    case "write":
      return `Writing ${what}`;
    case "critique":
      return `Critic review, round ${(state.rounds?.length ?? 0) + 1}`;
    case "revise":
      return `Revising ${what}`;
    case "done":
      return "Done";
  }
}

const WRITERS = {
  cold_email: {
    system: COLD_EMAIL_SYSTEM,
    submit: {
      name: "submit_campaign",
      description: "Submit the finished cold email campaign.",
      schema: emailCampaignSchema,
    },
    task: (r: ResearchBrief) =>
      `Write one cold email sequence (3 or 4 emails) for each of the top ${Math.min(
        3,
        r.angles.length || 3
      )} angles in the research.`,
    rubric: `Cold email for a professional services firm.
- First email under 90 words, follow-ups under 60, one ask each.
- Opener is about the prospect, not the sender. Would a busy firm owner read past line one?
- Every follow-up adds something new.
- Subject lines 2 to 5 words, lowercase, look internal.
- Copy is specific to this client's ICP and could not be sent by any other firm unchanged.
- Nothing invented beyond the brief's proof. Nothing from the "avoid" list.`,
  },
  content: {
    system: CONTENT_SYSTEM,
    submit: {
      name: "submit_posts",
      description: "Submit the finished LinkedIn post pack.",
      schema: contentPackSchema,
    },
    task: () =>
      `Write 5 LinkedIn posts for the firm's owner, one week of content. Cover different pains and angles from the research and mix the formats.`,
    rubric: `LinkedIn posts ghostwritten for a professional services firm owner.
- Hook is one line and earns the click without clickbait.
- One clear point per post that this buyer would nod at.
- Sounds like a real owner, first person, not a marketing team.
- Soft CTA. At most two hashtags.
- Formats vary across the pack.
- Nothing invented beyond the brief's proof. Nothing from the "avoid" list.`,
  },
} as const;

export async function advance(input: AdvanceInput): Promise<RunState> {
  const { kind, state, client, research, instructions, usage } = input;
  const brief = clientBrief(client);
  const notes = operatorNotes(instructions);

  if (kind === "research") return advanceResearch(state, brief, notes, usage, input.loadCaptures);

  if (!research) throw new Error("This run needs a research brief first.");
  const writer = WRITERS[kind];
  const researchBlock = `<research>\n${JSON.stringify(research, null, 2)}\n</research>`;
  const task = `${brief}${notes}\n\n${researchBlock}\n\n${writer.task(research)}`;
  const rounds = state.rounds ?? [];

  switch (state.phase) {
    case "write": {
      const draft = await runStructured<unknown>({
        system: writer.system,
        prompt: task,
        submit: writer.submit,
        effort: "medium",
        usage,
      });
      return { ...state, phase: "critique", draft };
    }

    case "critique": {
      const critique = await runStructured<Critique>({
        system: CRITIC_SYSTEM,
        prompt: `${brief}${notes}\n\n<rubric>\n${writer.rubric}\n</rubric>\n\n<draft>\n${JSON.stringify(
          state.draft,
          null,
          2
        )}\n</draft>\n\nReview this draft.`,
        submit: {
          name: "submit_critique",
          description: "Submit your review of the draft.",
          schema: critiqueSchema,
        },
        effort: "medium",
        usage,
      });
      const next = [...rounds, { round: rounds.length + 1, ...critique }];
      const passed = critique.score >= SHIP_SCORE || critique.issues.length === 0;
      const outOfRevisions = next.length > MAX_REVISIONS;
      return {
        ...state,
        rounds: next,
        final_score: critique.score,
        phase: passed || outOfRevisions ? "done" : "revise",
      };
    }

    case "revise": {
      const last = rounds[rounds.length - 1];
      const feedback = last
        ? `<critic_feedback score="${last.score}">\n${last.summary}\n${last.issues
            .map((i, n) => `${n + 1}. [${i.location}] ${i.problem} Fix: ${i.fix}`)
            .join("\n")}\n</critic_feedback>`
        : "";
      const draft = await runStructured<unknown>({
        system: writer.system,
        prompt: `${task}\n\n<previous_draft>\n${JSON.stringify(
          state.draft,
          null,
          2
        )}\n</previous_draft>\n\n${feedback}\n\nRevise the draft. Fix every issue, keep what works.`,
        submit: writer.submit,
        effort: "medium",
        usage,
      });
      return { ...state, phase: "critique", draft };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------
// Onboarding: Research agent → Strategy agent
// ---------------------------------------------------------------------
const MAX_DIVE_FAILURES = 2;

/** Called by the route when a step throws. Decides whether the run can move on. */
export function recordFailure(state: RunState): RunState {
  const failures = (state.failures ?? 0) + 1;
  if (state.phase === "dive" && failures >= MAX_DIVE_FAILURES) {
    // Don't let one competitor block the whole onboarding. Skip it and keep going.
    const dives = state.dives ?? [];
    const target = state.competitors?.[dives.length];
    if (target) {
      const stub: CompetitorDive = {
        name: target.name,
        website: target.website,
        positioning: "Deep dive failed twice and was skipped. Rerun onboarding to retry.",
        offer_and_pricing: "Unknown",
        channels: [],
        whats_working: [],
        weaknesses: [],
        sources: [],
      };
      const next = [...dives, stub];
      const more = next.length < (state.competitors?.length ?? 0);
      return {
        ...state,
        dives: next,
        skipped: [...(state.skipped ?? []), target.name],
        failures: 0,
        phase: more ? "dive" : "strategy",
      };
    }
  }
  return { ...state, failures };
}

function json(label: string, v: unknown) {
  return `<${label}>\n${JSON.stringify(v, null, 2)}\n</${label}>`;
}

async function captureBlocks(
  competitor: string,
  loadCaptures: AdvanceInput["loadCaptures"]
): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  if (!loadCaptures) return [];
  const captures = await loadCaptures(competitor);
  if (captures.length === 0) return [];
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `<chrome_captures competitor="${competitor}">\nThe operator's browser captured these pages. Screenshots follow their text.`,
    },
  ];
  for (const c of captures) {
    blocks.push({
      type: "text",
      text: `\n[${c.source}] ${c.url}\n${(c.text ?? "(no text captured)").slice(0, 6000)}`,
    });
    if (c.imageUrl) blocks.push({ type: "image", source: { type: "url", url: c.imageUrl } });
  }
  blocks.push({ type: "text", text: "</chrome_captures>" });
  return blocks;
}

async function advanceResearch(
  state: RunState,
  brief: string,
  notes: string,
  usage: Usage,
  loadCaptures: AdvanceInput["loadCaptures"]
): Promise<RunState> {
  const ok = (next: RunState): RunState => ({ ...next, failures: 0 });

  switch (state.phase) {
    case "profile": {
      const profile = await runStructured<CompanyProfile>({
        system: PROFILE_SYSTEM,
        prompt: `${brief}${notes}\n\nBuild the profile of this client firm.`,
        submit: {
          name: "submit_profile",
          description: "Submit the client firm's profile.",
          schema: companyProfileSchema,
        },
        web: { searches: 8, fetches: 6 },
        effort: "high",
        usage,
      });
      return ok({ ...state, profile, phase: "competitors" });
    }

    case "competitors": {
      const picked = await runStructured<CompetitorList>({
        system: COMPETITOR_PICK_SYSTEM,
        prompt: `${brief}${notes}\n\n${json("client_profile", state.profile)}\n\nPick the 3 competitors to study.`,
        submit: {
          name: "submit_competitors",
          description: "Submit the 3 competitors to deep dive.",
          schema: competitorListSchema,
        },
        web: { searches: 8, fetches: 4 },
        effort: "high",
        usage,
      });
      const competitors = picked.competitors.slice(0, 3);
      const nextPhase: Phase = !competitors.length
        ? "strategy"
        : state.wait_for_capture
          ? "capture"
          : "dive";
      return ok({ ...state, competitors, dives: [], phase: nextPhase });
    }

    case "capture":
      // Waits here until the operator runs the Chrome capture (or skips it).
      return state;

    case "dive": {
      const dives = state.dives ?? [];
      const target = state.competitors?.[dives.length];
      if (!target) return ok({ ...state, phase: "strategy" });
      const captured = await captureBlocks(target.name, loadCaptures);
      const text = `${brief}${notes}\n\n${json("client_profile", state.profile)}\n\n${json("competitor", target)}`;
      const dive = await runStructured<CompetitorDive>({
        system: COMPETITOR_DIVE_SYSTEM,
        prompt: captured.length
          ? [
              { type: "text", text },
              ...captured,
              { type: "text", text: `\nDo the deep dive on ${target.name}.` },
            ]
          : `${text}\n\nDo the deep dive on ${target.name}.`,
        submit: {
          name: "submit_dive",
          description: "Submit the channel-by-channel deep dive on this competitor.",
          schema: competitorDiveSchema,
        },
        web: { searches: 10, fetches: 8 },
        effort: "high",
        usage,
      });
      const next = [...dives, dive];
      const more = next.length < (state.competitors?.length ?? 0);
      return ok({ ...state, dives: next, phase: more ? "dive" : "strategy" });
    }

    case "strategy": {
      const research = await runStructured<ResearchBrief>({
        system: STRATEGY_SYSTEM,
        prompt: `${brief}${notes}\n\n${json("client_profile", state.profile)}\n\n${json(
          "competitor_dives",
          state.dives
        )}\n\nBuild the research brief and the replication playbook.`,
        submit: {
          name: "submit_research",
          description: "Submit the research brief with the replication playbook.",
          schema: researchSchema,
        },
        effort: "high",
        usage,
      });
      return ok({ ...state, brief: research, phase: "report" });
    }

    case "report": {
      const report = await runStructured<MarketReport>({
        system: REPORT_SYSTEM,
        prompt: `${brief}${notes}\n\n${json("client_profile", state.profile)}\n\n${json(
          "competitor_dives",
          state.dives
        )}\n\n${json("strategy", state.brief)}\n\nWrite the market analysis report.`,
        submit: {
          name: "submit_report",
          description: "Submit the market analysis report sections.",
          schema: marketReportSchema,
        },
        effort: "high",
        usage,
      });
      return ok({ ...state, report, phase: "scripts" });
    }

    case "scripts": {
      const scripts = await runStructured<Scripts>({
        system: SCRIPTS_SYSTEM,
        prompt: `${brief}${notes}\n\n${json("strategy", state.brief)}\n\n${json(
          "report",
          state.report
        )}\n\nWrite the scripts.`,
        submit: {
          name: "submit_scripts",
          description: "Submit every script.",
          schema: scriptsSchema,
        },
        effort: "high",
        usage,
      });
      return ok({ ...state, scripts, phase: "done" });
    }

    default:
      return state;
  }
}
