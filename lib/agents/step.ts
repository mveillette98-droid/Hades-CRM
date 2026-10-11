import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentError, RetryableAgentError, emptyUsage } from "./claude";
import { advance, pendingStepLabel, recordFailure, type CaptureForAgent, type RunState } from "./pipelines";
import { mergeUsage } from "./usage";
import type { AgentRun, Client, IntelCapture } from "@/lib/supabase/types";
import type { ResearchBrief } from "./schemas";

const LOCK_MS = 5 * 60 * 1000;

export interface StepResult {
  /** HTTP status the advance route answers with. */
  httpStatus: number;
  body: {
    status?: string;
    step?: string | null;
    done?: boolean;
    busy?: boolean;
    waiting?: "capture";
    error?: string;
    retryable?: boolean;
  };
  /** Set when an agent actually ran, so callers can refresh the client page. */
  clientId?: string;
}

/**
 * Run the next agent in a run's pipeline and persist the result.
 * Shared by the advance route (signed-in user, RLS) and the agent worker
 * (service role). Exactly one agent call per step.
 */
export async function stepRun(db: SupabaseClient, runId: string): Promise<StepResult> {
  // Claim the run. If another tab, request or worker holds the lock, back off.
  // Two tries (no lock, then an expired lock) instead of one .or(): PostgREST
  // re-applies or= filters to the updated row, so an .or() claim always comes back empty.
  const now = new Date();
  const claim = (expired: boolean) => {
    const q = db
      .from("agent_runs")
      .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
      .eq("id", runId)
      .eq("status", "running");
    return (expired ? q.lt("locked_until", now.toISOString()) : q.is("locked_until", null))
      .select("*")
      .maybeSingle<AgentRun>();
  };
  const claimed = (await claim(false)).data ?? (await claim(true)).data;
  const unlock = () => db.from("agent_runs").update({ locked_until: null }).eq("id", runId);

  if (!claimed) {
    const { data: run } = await db
      .from("agent_runs")
      .select("status, step, output")
      .eq("id", runId)
      .maybeSingle<Pick<AgentRun, "status" | "step" | "output">>();
    if (!run) return { httpStatus: 404, body: { error: "Run not found." } };
    if (run.status !== "running") {
      return { httpStatus: 200, body: { status: run.status, step: run.step, done: true } };
    }
    return { httpStatus: 409, body: { status: "running", step: run.step, busy: true } };
  }

  const run = claimed;
  const state = (run.output ?? {}) as unknown as RunState;

  if (state.phase === "done") {
    await unlock();
    return { httpStatus: 200, body: { status: run.status, step: run.step, done: true } };
  }
  if (state.phase === "capture") {
    await unlock();
    return { httpStatus: 200, body: { status: "running", step: run.step, waiting: "capture" } };
  }

  const { data: client } = await db
    .from("clients")
    .select("*")
    .eq("id", run.client_id)
    .maybeSingle<Client>();
  if (!client) {
    await unlock();
    return { httpStatus: 404, body: { error: "Client not found." } };
  }

  const usage = emptyUsage();
  try {
    const research = state.research_run_id ? await researchById(db, state.research_run_id) : null;
    const next = await advance({
      kind: run.kind,
      state,
      client,
      research,
      instructions: run.instructions,
      usage,
      loadCaptures: (competitor) => loadCaptures(db, run.client_id, competitor),
    });
    const done = next.phase === "done";
    const step = pendingStepLabel(run.kind, next);

    await db
      .from("agent_runs")
      .update({
        output: next as unknown as Record<string, unknown>,
        usage: mergeUsage(run.usage, usage) as unknown as Record<string, number>,
        step,
        status: done ? "succeeded" : "running",
        completed_at: done ? new Date().toISOString() : null,
        error: null,
        locked_until: null,
      })
      .eq("id", run.id);

    return {
      httpStatus: 200,
      clientId: run.client_id,
      body: {
        status: done ? "succeeded" : "running",
        step,
        done,
        waiting: next.phase === "capture" ? "capture" : undefined,
      },
    };
  } catch (err) {
    const retryable = !(err instanceof AgentError) || err instanceof RetryableAgentError;
    const message =
      err instanceof AgentError
        ? err.message
        : err instanceof Error
          ? `Agent call failed: ${err.message}`
          : "Agent call failed.";

    // Keep the state so the run can resume. A competitor that keeps failing gets skipped.
    const next = recordFailure(state);
    const step = pendingStepLabel(run.kind, next);
    await db
      .from("agent_runs")
      .update({
        output: next as unknown as Record<string, unknown>,
        step,
        error: message,
        usage: mergeUsage(run.usage, usage) as unknown as Record<string, number>,
        locked_until: null,
      })
      .eq("id", run.id);

    return {
      httpStatus: retryable ? 503 : 422,
      body: { error: message, retryable, step, done: false },
    };
  }
}

async function researchById(db: SupabaseClient, id: string): Promise<ResearchBrief | null> {
  const { data } = await db
    .from("agent_runs")
    .select("output")
    .eq("id", id)
    .maybeSingle<Pick<AgentRun, "output">>();
  return (data?.output as RunState | null)?.brief ?? null;
}

/** Chrome captures for a competitor, newest first, with short-lived signed screenshot URLs. */
export async function loadCaptures(
  db: SupabaseClient,
  clientId: string,
  competitor: string
): Promise<CaptureForAgent[]> {
  const { data } = await db
    .from("intel_captures")
    .select("*")
    .eq("client_id", clientId)
    .ilike("competitor", competitor)
    .eq("ok", true)
    .order("captured_at", { ascending: false })
    .limit(12);
  const rows = (data ?? []) as IntelCapture[];

  // Keep the newest capture per source.
  const latest = new Map<string, IntelCapture>();
  for (const r of rows) if (!latest.has(r.source)) latest.set(r.source, r);

  const out: CaptureForAgent[] = [];
  for (const r of Array.from(latest.values())) {
    let imageUrl: string | null = null;
    if (r.screenshot_path) {
      const { data: signed } = await db.storage
        .from("intel")
        .createSignedUrl(r.screenshot_path, 60 * 30);
      imageUrl = signed?.signedUrl ?? null;
    }
    out.push({ source: r.source, url: r.url, text: r.page_text, imageUrl });
  }
  return out;
}
