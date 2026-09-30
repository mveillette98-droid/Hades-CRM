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
  SYNTHESIS_SYSTEM,
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
  researchSchema,
  type CompanyProfile,
  type CompetitorDive,
  type CompetitorList,
  type Critique,
  type ResearchBrief,
} from "./schemas";

/**
 * The agent team as a resumable state machine.
 *
 *   research:           profile → competitors → dive ×3 → synthesis → done
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
  | "dive"
  | "synthesis"
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
  /** research runs: the synthesized brief + playbook the writers use */
  brief?: ResearchBrief;
  /** writer draft (cold_email / content runs) */
  draft?: unknown;
  rounds?: CriticRound[];
  final_score?: number;
}

export interface AdvanceInput {
  kind: AgentKind;
  state: RunState;
  client: Client;
  research: ResearchBrief | null;
  instructions: string | null;
  usage: Usage;
}

export function initialState(kind: AgentKind, researchRunId?: string): RunState {
  return kind === "research"
    ? { phase: "profile", dives: [] }
    : { phase: "write", research_run_id: researchRunId, rounds: [] };
}

/** Label for the step that `advance` is about to run. */
export function pendingStepLabel(kind: AgentKind, state: RunState): string {
  const what = kind === "content" ? "LinkedIn posts" : "cold email sequences";
  switch (state.phase) {
    case "profile":
      return "Profiling the client";
    case "competitors":
      return "Picking the top 3 competitors";
    case "dive": {
      const i = state.dives?.length ?? 0;
      const name = state.competitors?.[i]?.name ?? "competitor";
      return `Deep dive: ${name} (${i + 1} of ${state.competitors?.length ?? 3})`;
    }
    case "synthesis":
      return "Building the replication playbook";
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

  if (kind === "research") return advanceResearch(state, brief, notes, usage);

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
// Onboarding research
// ---------------------------------------------------------------------
async function advanceResearch(
  state: RunState,
  brief: string,
  notes: string,
  usage: Usage
): Promise<RunState> {
  const json = (label: string, v: unknown) => `<${label}>\n${JSON.stringify(v, null, 2)}\n</${label}>`;

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
      return { ...state, profile, phase: "competitors" };
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
      return { ...state, competitors, dives: [], phase: competitors.length ? "dive" : "synthesis" };
    }

    case "dive": {
      const dives = state.dives ?? [];
      const target = state.competitors?.[dives.length];
      if (!target) return { ...state, phase: "synthesis" };
      const dive = await runStructured<CompetitorDive>({
        system: COMPETITOR_DIVE_SYSTEM,
        prompt: `${brief}${notes}\n\n${json("client_profile", state.profile)}\n\n${json(
          "competitor",
          target
        )}\n\nDo the deep dive on ${target.name}.`,
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
      return { ...state, dives: next, phase: more ? "dive" : "synthesis" };
    }

    case "synthesis": {
      const research = await runStructured<ResearchBrief>({
        system: SYNTHESIS_SYSTEM,
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
      return { ...state, brief: research, phase: "done" };
    }

    default:
      return state;
  }
}
