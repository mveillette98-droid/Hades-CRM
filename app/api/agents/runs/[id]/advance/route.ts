import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/agents/runs";
import { stepRun } from "@/lib/agents/step";

// One agent call per request. Steps stop themselves at ~250s (see claude.ts).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Run the next agent in this run's pipeline and persist the result. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const result = await stepRun(supabase, params.id);
  if (result.clientId) revalidatePath(`/clients/${result.clientId}`);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
