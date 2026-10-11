import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One helper every Cadence agent goes through.
 *
 * Each agent gets a single "submit" tool with a strict JSON schema. The
 * agent can think, search the web (research only), then hands its final
 * answer back by calling that tool. We loop until it does.
 */

export const AGENT_MODEL = process.env.CADENCE_AGENT_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  web_search_requests: number;
  calls: number;
}

export function emptyUsage(): Usage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    web_search_requests: 0,
    calls: 0,
  };
}

function addUsage(total: Usage, u: Anthropic.Beta.BetaUsage) {
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  total.web_search_requests += u.server_tool_use?.web_search_requests ?? 0;
  total.calls += 1;
}

export class AgentError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AgentError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (and to Vercel) to run agents."
    );
  }
  // Retries 429 / 5xx / connection errors with backoff before we ever see them.
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

export interface StructuredCall {
  /** Stable role prompt. Cached, so keep per-run details out of it. */
  system: string;
  /** The task: client brief, prior outputs, operator notes. Blocks allow screenshots. */
  prompt: string | Anthropic.Beta.BetaContentBlockParam[];
  submit: {
    name: string;
    description: string;
    schema: Record<string, unknown>;
  };
  /** Give the agent web search + fetch, with per-call caps. */
  web?: { searches: number; fetches: number };
  effort?: Effort;
  usage: Usage;
}

const MAX_TURNS = 10;
const MAX_NUDGES = 2;

/**
 * Hard ceiling for one step. The route has 300s; we stop well before so the
 * error gets recorded and the step can be retried instead of the function
 * being killed mid-write.
 */
const STEP_BUDGET_MS = 250_000;

export class RetryableAgentError extends AgentError {}

export async function runStructured<T>(call: StructuredCall): Promise<T> {
  const anthropic = getClient();

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    {
      name: call.submit.name,
      description: call.submit.description,
      strict: true,
      input_schema: call.submit.schema as Anthropic.Beta.BetaTool.InputSchema,
    },
  ];
  if (call.web) {
    tools.push(
      { type: "web_search_20260209", name: "web_search", max_uses: call.web.searches },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: call.web.fetches }
    );
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: call.prompt },
  ];

  const deadline = Date.now() + STEP_BUDGET_MS;
  let nudges = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const remaining = deadline - Date.now();
    if (remaining < 15_000) {
      throw new RetryableAgentError("This step ran long and was cut off. It will retry.");
    }
    const response = await anthropic.beta.messages
      .stream(
        {
        model: AGENT_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: call.effort ?? "medium" },
        system: [
          { type: "text", text: call.system, cache_control: { type: "ephemeral" } },
        ],
        tools,
        tool_choice: { type: "auto" },
        messages,
        },
        { timeout: remaining, maxRetries: remaining > 60_000 ? 2 : 0 }
      )
      .finalMessage();

    addUsage(call.usage, response.usage);

    if (response.stop_reason === "refusal") {
      throw new AgentError(
        `The model declined this request${
          response.stop_details?.category ? ` (${response.stop_details.category})` : ""
        }. Adjust the brief or instructions and try again.`
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AgentError("The agent ran out of room before finishing. Try a narrower instruction.");
    }

    const submitted = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock =>
        b.type === "tool_use" && b.name === call.submit.name
    );
    if (submitted) return submitted.input as T;

    // Append-only history: keep every block the model produced.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const strayTools = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
    );
    if (strayTools.length > 0) {
      messages.push({
        role: "user",
        content: strayTools.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          is_error: true,
          content: `Unknown tool. Call ${call.submit.name} with your final answer.`,
        })),
      });
      continue;
    }

    if (nudges >= MAX_NUDGES) break;
    nudges++;
    messages.push({
      role: "user",
      content: `Call ${call.submit.name} now with your final answer.`,
    });
  }

  throw new AgentError(`The agent never submitted a result via ${call.submit.name}.`);
}
