import { NextResponse } from "next/server";
import { z } from "zod";
import { publicDb } from "@/lib/teardown/db";
import { requestContext, sendCapiEvent } from "@/lib/teardown/meta";

export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max).optional().default("");

const body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: text(40),
  firm: z.string().trim().min(1).max(160),
  website: z.string().trim().min(3).max(300),
  role: text(60),
  size: text(40),
  problem: text(1000),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(200),
  utm_content: text(200),
  utm_term: text(200),
  fbclid: text(500),
  /** honeypot: people never see this field, bots fill it */
  company_site: text(300),
  /** ms the form was open before submit */
  elapsed: z.number().optional(),
});

/** Public: the teardown form. Creates the lead and the prospect. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Fill in the required fields and try again." }, { status: 400 });
  }
  const { company_site, elapsed, ...fields } = parsed.data;

  // Bots: pretend it worked, store nothing.
  if (company_site || (elapsed !== undefined && elapsed < 2500)) {
    return NextResponse.json({ leadId: crypto.randomUUID() });
  }

  const { data, error } = await publicDb().rpc("submit_teardown", { p: fields });
  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("bad_email")) {
      return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    }
    console.error(`submit_teardown failed: ${msg}`);
    return NextResponse.json(
      { error: "Something broke on our side. Try again in a minute." },
      { status: 500 }
    );
  }

  const { lead_id: leadId, duplicate } = data as { lead_id: string; duplicate: boolean };
  if (!duplicate) {
    await sendCapiEvent({
      name: "Lead",
      eventId: `lead-${leadId}`,
      email: fields.email,
      phone: fields.phone,
      fbclid: fields.fbclid,
      ...requestContext(req),
    });
  }
  return NextResponse.json({ leadId });
}
