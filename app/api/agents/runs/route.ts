import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_MODEL } from "@/lib/agents/claude";
import { initialState, pendingStepLabel } from "@/lib/agents/pipelines";
import { getClientRow, latestResearch, requireUser } from "@/lib/agents/runs";

const body = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(["research", "cold_email", "content"]),
  instructions: z.string().trim().max(12000).optional(),
});

/** Create a run. The browser then calls /advance until it's done. */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { clientId, kind, instructions } = parsed.data;

  const client = await getClientRow(clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  let researchRunId: string | undefined;
  if (kind !== "research") {
    const research = await latestResearch(clientId);
    if (!research) {
      return NextResponse.json(
        { error: "Run research for this client first. Every writer works off it." },
        { status: 409 }
      );
    }
    researchRunId = research.id;
  }

  const state = initialState(kind, researchRunId);
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      client_id: clientId,
      kind,
      status: "running",
      step: pendingStepLabel(kind, state),
      instructions: instructions || null,
      output: state as unknown as Record<string, unknown>,
      model: AGENT_MODEL,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not start run." }, { status: 500 });
  }
  return NextResponse.json({ runId: data.id });
}
