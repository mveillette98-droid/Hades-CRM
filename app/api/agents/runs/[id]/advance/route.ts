import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AgentError, emptyUsage } from "@/lib/agents/claude";
import { advance, pendingStepLabel, type RunState } from "@/lib/agents/pipelines";
import { getClientRow, mergeUsage, requireUser, researchById } from "@/lib/agents/runs";
import type { AgentRun } from "@/lib/supabase/types";

// One agent call per request. Research with web search is the slowest step.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Run the next agent in this run's pipeline and persist the result. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: run } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<AgentRun>();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const state = (run.output ?? {}) as unknown as RunState;
  if (run.status !== "running" || state.phase === "done") {
    return NextResponse.json({ status: run.status, step: run.step, done: true });
  }

  const client = await getClientRow(run.client_id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

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
      })
      .eq("id", run.id);

    revalidatePath(`/clients/${run.client_id}`);
    return NextResponse.json({
      status: done ? "succeeded" : "running",
      step: pendingStepLabel(run.kind, next),
      done,
    });
  } catch (err) {
    const message =
      err instanceof AgentError
        ? err.message
        : err instanceof Error
          ? `Agent call failed: ${err.message}`
          : "Agent call failed.";

    // Keep the state so the run can be resumed; just record the error.
    await supabase
      .from("agent_runs")
      .update({
        error: message,
        usage: mergeUsage(run.usage, usage) as unknown as Record<string, number>,
      })
      .eq("id", run.id);

    return NextResponse.json({ error: message, done: false }, { status: 502 });
  }
}
