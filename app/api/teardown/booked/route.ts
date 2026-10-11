import { NextResponse } from "next/server";
import { z } from "zod";
import { publicDb } from "@/lib/teardown/db";
import { requestContext, sendCapiEvent } from "@/lib/teardown/meta";

export const dynamic = "force-dynamic";

const body = z.object({
  leadId: z.string().uuid(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Public: the calendar embed said the call is booked. Moves the lead to
 * Discovery Booked and queues the teardown for the agent worker.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { leadId, email, phone } = parsed.data;

  const { data, error } = await publicDb().rpc("teardown_booked", { p_lead: leadId });
  if (error) {
    // Unknown lead (or a bot's fake one): nothing to do, nothing to tell them.
    if (!error.message.includes("not_found")) console.error(`teardown_booked failed: ${error.message}`);
    return NextResponse.json({ ok: true });
  }

  const result = data as { ok: boolean; already?: boolean };
  if (!result.already) {
    await sendCapiEvent({
      name: "Schedule",
      eventId: `booked-${leadId}`,
      email,
      phone,
      ...requestContext(req),
    });
  }
  return NextResponse.json({ ok: true });
}
