import "server-only";
import type { AgentKind, Client } from "@/lib/supabase/types";
import { runStructured, type Usage } from "./claude";
import {
  CONTENT_SYSTEM,
  COLD_EMAIL_SYSTEM,
  CRITIC_SYSTEM,
  RESEARCH_SYSTEM,
  clientBrief,
  operatorNotes,
} from "./prompts";
import {
  contentPackSchema,
  critiqueSchema,
  emailCampaignSchema,
  researchSchema,
  type Critique,
  type ResearchBrief,
} from "./schemas";

/**
 * The agent team as a resumable state machine.
 *
 *   research:          research → done
 *   cold_email/content: write → critique ⇄ revise → done
 *
 * Every call to `advance` runs exactly one agent and returns the new state,
 * so each HTTP request stays well under serverless time limits and a run
 * that gets interrupted can pick up where it left off.
 */

export const SHIP_SCORE = 8;
export const MAX_REVISIONS = 2;

export type Phase = "research" | "write" | "critique" | "revise" | "done";

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
  /** research brief (research runs) */
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
    ? { phase: "research" }
    : { phase: "write", research_run_id: researchRunId, rounds: [] };
}

/** Label for the step that `advance` is about to run. */
export function pendingStepLabel(kind: AgentKind, state: RunState): string {
  const what = kind === "content" ? "LinkedIn posts" : "cold email sequences";
  switch (state.phase) {
    case "research":
      return "Researching the market";
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

  if (kind === "research") {
    const result = await runStructured<ResearchBrief>({
      system: RESEARCH_SYSTEM,
      prompt: `${brief}${notes}\n\nBuild the research brief for this client.`,
      submit: {
        name: "submit_research",
        description: "Submit the finished research brief.",
        schema: researchSchema,
      },
      web: true,
      effort: "high",
      usage,
    });
    return { phase: "done", brief: result };
  }

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
