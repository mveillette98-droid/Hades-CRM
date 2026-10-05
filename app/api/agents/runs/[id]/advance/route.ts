import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AgentError, RetryableAgentError, emptyUsage } from "@/lib/agents/claude";
import {
  advance,
  pendingStepLabel,
  recordFailure,
  type RunState,
} from "@/lib/agents/pipelines";
import {
  getClientRow,
  loadCaptures,
  mergeUsage,
  requireUser,
  researchById,
} from "@/lib/agents/runs";
import type { AgentRun } from "@/lib/supabase/types";

// One agent call per request. Steps stop themselves at ~250s (see claude.ts).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LOCK_MS = 5 * 60 * 1000;

/** Run the next agent in this run's pipeline and persist the result. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Claim the run. If another tab or request holds the lock, back off.
  // Two tries (no lock, then an expired lock) instead of one .or(): PostgREST
  // re-applies or= filters to the updated row, so an .or() claim always comes back empty.
  const now = new Date();
  const claim = (expired: boolean) => {
    const q = supabase
      .from("agent_runs")
      .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
      .eq("id", params.id)
      .eq("status", "running");
    return (expired ? q.lt("locked_until", now.toISOString()) : q.is("locked_until", null))
      .select("*")
      .maybeSingle<AgentRun>();
  };
  const claimed = (await claim(false)).data ?? (await claim(true)).data;

  if (!claimed) {
    const { data: run } = await supabase
      .from("agent_runs")
      .select("status, step, output")
      .eq("id", params.id)
      .maybeSingle<Pick<AgentRun, "status" | "step" | "output">>();
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    if (run.status !== "running") {
      return NextResponse.json({ status: run.status, step: run.step, done: true });
    }
    return NextResponse.json({ status: "running", step: run.step, busy: true }, { status: 409 });
  }

  const run = claimed;
  const state = (run.output ?? {}) as unknown as RunState;

  if (state.phase === "done") {
    await supabase.from("agent_runs").update({ locked_until: null }).eq("id", run.id);
    return NextResponse.json({ status: run.status, step: run.step, done: true });
  }
  if (state.phase === "capture") {
    await supabase.from("agent_runs").update({ locked_until: null }).eq("id", run.id);
    return NextResponse.json({ status: "running", step: run.step, waiting: "capture" });
  }

  const client = await getClientRow(run.client_id);
  if (!client) {
    await supabase.from("agent_runs").update({ locked_until: null }).eq("id", run.id);
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const usage = emptyUsage();
  try {
    const research = state.research_run_id ? await researchById(state.research_run_id) : null;
    const next = await advance({
      kind: run.kind,
      state,
      client,
      research,
      instructions: run.instructions,
      usage,
      loadCaptures: (competitor) => loadCaptures(run.client_id, competitor),
    });
    const done = next.phase === "done";

    await supabase
      .from("agent_runs")
      .update({
        output: next as unknown as Record<string, unknown>,
        usage: mergeUsage(run.usage, usage) as unknown as Record<string, number>,
        step: pendingStepLabel(run.kind, next),
        status: done ? "succeeded" : "running",
        completed_at: done ? new Date().toISOString() : null,
        error: null,
        locked_until: null,
      })
      .eq("id", run.id);

    revalidatePath(`/clients/${run.client_id}`);
    return NextResponse.json({
      status: done ? "succeeded" : "running",
      step: pendingStepLabel(run.kind, next),
      done,
      waiting: next.phase === "capture" ? "capture" : undefined,
    });
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
    await supabase
      .from("agent_runs")
      .update({
        output: next as unknown as Record<string, unknown>,
        step: pendingStepLabel(run.kind, next),
        error: message,
        usage: mergeUsage(run.usage, usage) as unknown as Record<string, number>,
        locked_until: null,
      })
      .eq("id", run.id);

    return NextResponse.json(
      { error: message, retryable, step: pendingStepLabel(run.kind, next), done: false },
      { status: retryable ? 503 : 422 }
    );
  }
}
