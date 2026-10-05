"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/leads/actions";
import type { CampaignStep, Mailbox } from "@/lib/supabase/types";
import type { EmailCampaign } from "@/lib/agents/schemas";
import { decryptSecret, encryptSecret } from "./crypto";
import { parseLeads } from "./csv";
import { composeEmail, normalizeSteps } from "./render";
import { emailDomain } from "./classify";
import { isValidTimezone } from "./schedule";
import { campaignSettingsSchema, mailboxSchema, stepsSchema } from "./schema";
import { imapInbox, smtpMailer, type MailboxConn } from "./transport";
import { checkDomain, providerFor } from "./dns";
import { loadChecklist } from "./readiness-data";
import { randomUUID } from "node:crypto";

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function fieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.join(".");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

function errMessage(e: unknown): string {
  const err = e as { response?: string; message?: string };
  return (err.response || err.message || String(e)).slice(0, 300);
}

// ---------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------
export async function saveMailbox(
  id: string | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const parsed = mailboxSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the form errors.", fieldErrors: fieldErrors(parsed.error.issues) };
  }
  const { password, ...values } = parsed.data;
  if (!id && !password) {
    return { ok: false, error: "Enter the app password.", fieldErrors: { password: "Required" } };
  }

  let enc: string | null = null;
  if (password) {
    try {
      enc = encryptSecret(password.replace(/\s+/g, ""));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const { supabase, user } = await requireUser();
  const row = { ...values, username: values.username ?? values.email };

  let mailboxId = id;
  if (id) {
    const { error } = await supabase
      .from("mailboxes")
      .update({ ...row, ...(enc ? { status: "active", last_error: null } : {}) })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("mailboxes")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: error?.message.includes("mailboxes_email_key")
          ? "That mailbox is already added."
          : error?.message ?? "Could not save the mailbox.",
      };
    }
    mailboxId = data.id as string;
  }

  if (enc && mailboxId) {
    const { error } = await supabase
      .from("mailbox_secrets")
      .upsert({ mailbox_id: mailboxId, password_enc: enc, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: `Mailbox saved, password not: ${error.message}` };
  }

  revalidatePath("/outbound");
  return { ok: true, data: { id: mailboxId! } };
}

async function loadConn(id: string): Promise<{ conn: MailboxConn; row: Mailbox } | { error: string }> {
  const { supabase } = await requireUser();
  const [{ data: row }, { data: secret }] = await Promise.all([
    supabase.from("mailboxes").select("*").eq("id", id).maybeSingle<Mailbox>(),
    supabase
      .from("mailbox_secrets")
      .select("password_enc")
      .eq("mailbox_id", id)
      .maybeSingle<{ password_enc: string }>(),
  ]);
  if (!row) return { error: "Mailbox not found." };
  if (!secret) return { error: "No password saved for this mailbox." };
  let password: string;
  try {
    password = decryptSecret(secret.password_enc);
  } catch (e) {
    return { error: `Can't read the saved password: ${(e as Error).message}` };
  }
  return {
    row,
    conn: {
      id: row.id,
      email: row.email,
      from_name: row.from_name,
      username: row.username,
      password,
      smtp_host: row.smtp_host,
      smtp_port: row.smtp_port,
      imap_host: row.imap_host,
      imap_port: row.imap_port,
    },
  };
}

/** Log into SMTP and IMAP without sending anything. */
export async function testMailbox(id: string): Promise<ActionResult<{ message: string }>> {
  const loaded = await loadConn(id);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { supabase } = await requireUser();
  try {
    await smtpMailer.verify(loaded.conn);
  } catch (e) {
    return { ok: false, error: `Sending login failed: ${errMessage(e)}` };
  }
  if (loaded.conn.imap_host) {
    try {
      await imapInbox.verify(loaded.conn);
    } catch (e) {
      return { ok: false, error: `Sending works. Reading replies failed: ${errMessage(e)}` };
    }
  }
  await supabase
    .from("mailboxes")
    .update({ status: "active", last_error: null, verified_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/outbound");
  revalidatePath("/outbound/setup");
  return {
    ok: true,
    data: {
      message: loaded.conn.imap_host
        ? "Connected. It can send and read replies."
        : "Connected for sending. Add an IMAP host or replies won't be tracked.",
    },
  };
}

export async function setMailboxStatus(id: string, status: "active" | "paused"): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("mailboxes").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbound");
  return { ok: true };
}

export async function deleteMailbox(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("mailboxes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbound");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------
export async function createCampaignFromRun(
  runId: string,
  sequenceIndex: number
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, client_id, kind, output")
    .eq("id", runId)
    .maybeSingle<{ id: string; client_id: string; kind: string; output: { draft?: EmailCampaign } | null }>();
  const seq = run?.output?.draft?.sequences?.[sequenceIndex];
  if (!run || run.kind !== "cold_email" || !seq) return { ok: false, error: "That sequence wasn't found." };

  const steps = normalizeSteps(
    seq.emails.map((e) => ({ step: e.step, day: e.send_day, subject: e.subject, body: e.body }))
  );
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      client_id: run.client_id,
      source_run_id: run.id,
      name: seq.angle.slice(0, 120),
      steps,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the campaign." };

  revalidatePath("/outbound");
  revalidatePath(`/clients/${run.client_id}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function createBlankCampaign(clientId: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      client_id: clientId,
      name: "New campaign",
      steps: [{ step: 1, day: 1, subject: "", body: "Hi {{first_name}},\n\n" }],
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the campaign." };
  revalidatePath("/outbound");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateCampaignSettings(id: string, formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    window_start: formData.get("window_start"),
    window_end: formData.get("window_end"),
    thread_followups: formData.get("thread_followups") === "on",
    footer: formData.get("footer") ?? undefined,
    send_days: formData.getAll("send_days").map((d) => Number(d)),
    mailbox_ids: formData.getAll("mailbox_ids").map(String),
  };
  const parsed = campaignSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the form errors.", fieldErrors: fieldErrors(parsed.error.issues) };
  }
  const { mailbox_ids, ...values } = parsed.data;
  if (!isValidTimezone(values.timezone)) return { ok: false, error: "Unknown time zone." };
  if (values.window_end <= values.window_start) {
    return { ok: false, error: "The send window has to end after it starts." };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("campaigns").update(values).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { error: delErr } = await supabase.from("campaign_mailboxes").delete().eq("campaign_id", id);
  if (delErr) return { ok: false, error: delErr.message };
  if (mailbox_ids.length > 0) {
    const { error: linkErr } = await supabase
      .from("campaign_mailboxes")
      .insert(mailbox_ids.map((mailbox_id) => ({ campaign_id: id, mailbox_id })));
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  revalidatePath(`/outbound/${id}`);
  revalidatePath("/outbound");
  return { ok: true };
}

export async function updateCampaignSteps(id: string, steps: CampaignStep[]): Promise<ActionResult> {
  const parsed = stepsSchema.safeParse(steps);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid steps." };
  const normalized = normalizeSteps(parsed.data);
  if (!normalized[0]?.subject.trim()) return { ok: false, error: "Email 1 needs a subject." };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("campaigns")
    .update({ steps: normalized, copy_approved_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outbound/${id}`);
  return { ok: true };
}

export async function setCampaignStatus(
  id: string,
  status: "active" | "paused" | "draft"
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, steps, started_at")
    .eq("id", id)
    .maybeSingle<{ id: string; steps: CampaignStep[]; started_at: string | null }>();
  if (!campaign) return { ok: false, error: "Campaign not found." };

  if (status === "active") {
    const checklist = await loadChecklist(supabase, id);
    const blocking = checklist?.items.filter((i) => i.status === "fail") ?? [];
    if (!checklist || blocking.length > 0) {
      return {
        ok: false,
        error: `Not ready to send: ${blocking.map((i) => i.label.toLowerCase()).join(", ")}. See the launch checklist.`,
      };
    }
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      status,
      ...(status === "active" && !campaign.started_at ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outbound/${id}`);
  revalidatePath("/outbound");
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbound");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------
export interface ImportSummary {
  added: number;
  invalid: number;
  alreadyContacted: number;
  suppressed: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function importLeads(campaignId: string, csv: string): Promise<ActionResult<ImportSummary>> {
  const parsed = parseLeads(csv);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (parsed.leads.length > 5000) return { ok: false, error: "Import 5,000 leads or fewer at a time." };

  const { supabase } = await requireUser();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, client_id")
    .eq("id", campaignId)
    .maybeSingle<{ id: string; client_id: string }>();
  if (!campaign) return { ok: false, error: "Campaign not found." };

  // Never email someone twice for the same client, and never email the
  // suppression list.
  const { data: siblings } = await supabase.from("campaigns").select("id").eq("client_id", campaign.client_id);
  const campaignIds = ((siblings ?? []) as { id: string }[]).map((c) => c.id);
  const emails = parsed.leads.map((l) => l.email);
  const domains = Array.from(new Set(emails.map(emailDomain)));

  const taken = new Set<string>();
  const blocked = new Set<string>();
  const blockedDomains = new Set<string>();
  for (const part of chunk(emails, 200)) {
    const [{ data: existing }, { data: sup }] = await Promise.all([
      supabase.from("campaign_leads").select("email").in("campaign_id", campaignIds).in("email", part),
      supabase.from("suppressions").select("email").in("email", part),
    ]);
    for (const r of (existing ?? []) as { email: string }[]) taken.add(r.email.toLowerCase());
    for (const r of (sup ?? []) as { email: string }[]) blocked.add(r.email.toLowerCase());
  }
  for (const part of chunk(domains, 200)) {
    const { data } = await supabase.from("suppressions").select("domain").in("domain", part);
    for (const r of (data ?? []) as { domain: string }[]) blockedDomains.add(r.domain.toLowerCase());
  }

  const summary: ImportSummary = { added: 0, invalid: parsed.invalid, alreadyContacted: 0, suppressed: 0 };
  const rows = [];
  for (const l of parsed.leads) {
    if (blocked.has(l.email) || blockedDomains.has(emailDomain(l.email))) {
      summary.suppressed++;
      continue;
    }
    if (taken.has(l.email)) {
      summary.alreadyContacted++;
      continue;
    }
    rows.push({ campaign_id: campaignId, ...l });
  }
  for (const part of chunk(rows, 500)) {
    const { error, count } = await supabase.from("campaign_leads").insert(part, { count: "exact" });
    if (error) return { ok: false, error: `Imported ${summary.added} before an error: ${error.message}` };
    summary.added += count ?? part.length;
  }

  revalidatePath(`/outbound/${campaignId}`);
  return { ok: true, data: summary };
}

export async function setLeadPaused(leadId: string, campaignId: string, paused: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: lead } = await supabase
    .from("campaign_leads")
    .select("status, current_step")
    .eq("id", leadId)
    .maybeSingle<{ status: string; current_step: number }>();
  if (!lead) return { ok: false, error: "Lead not found." };
  const status = paused ? "paused" : lead.current_step > 0 ? "active" : "queued";
  const { error } = await supabase.from("campaign_leads").update({ status, locked_until: null }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outbound/${campaignId}`);
  return { ok: true };
}

export async function deleteLead(leadId: string, campaignId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("campaign_leads").delete().eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outbound/${campaignId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------
export async function labelReply(messageId: string, label: string | null): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: msg } = await supabase
    .from("email_messages")
    .select("lead_id, campaign_id")
    .eq("id", messageId)
    .maybeSingle<{ lead_id: string | null; campaign_id: string | null }>();
  if (!msg) return { ok: false, error: "Message not found." };
  await supabase.from("email_messages").update({ handled: true }).eq("id", messageId);
  if (msg.lead_id) await supabase.from("campaign_leads").update({ reply_label: label }).eq("id", msg.lead_id);
  revalidatePath("/outbound");
  if (msg.campaign_id) revalidatePath(`/outbound/${msg.campaign_id}`);
  return { ok: true };
}

export async function suppressAddress(value: string): Promise<ActionResult> {
  const v = value.trim().toLowerCase().replace(/^@/, "");
  if (!v || !v.includes(".")) return { ok: false, error: "Enter an email or a domain." };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("suppressions")
    .insert(v.includes("@") ? { email: v, reason: "manual" } : { domain: v, reason: "manual" });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  revalidatePath("/outbound");
  return { ok: true };
}

/** Send one rendered step to yourself so you can see exactly what goes out. */
export async function sendTestEmail(
  campaignId: string,
  to: string,
  stepIndex: number
): Promise<ActionResult<{ message: string }>> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim())) return { ok: false, error: "Enter a valid email." };
  const { supabase } = await requireUser();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle<{ steps: CampaignStep[]; thread_followups: boolean; footer: string | null }>();
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const steps = normalizeSteps(campaign.steps ?? []);
  if (!steps[stepIndex]) return { ok: false, error: "That step doesn't exist." };

  const { data: link } = await supabase
    .from("campaign_mailboxes")
    .select("mailbox_id")
    .eq("campaign_id", campaignId)
    .limit(1)
    .maybeSingle<{ mailbox_id: string }>();
  if (!link) return { ok: false, error: "Pick a sending mailbox in Settings first." };
  const loaded = await loadConn(link.mailbox_id);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const { data: sample } = await supabase
    .from("campaign_leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const lead = (sample as Parameters<typeof composeEmail>[0]["lead"] | null) ?? {
    email: to,
    first_name: "Alex",
    last_name: "Morgan",
    company: "Sample CPA Group",
    title: "Managing Partner",
    personal_line: null,
    fields: {},
  };

  const composed = composeEmail({
    steps,
    stepIndex,
    threadFollowups: campaign.thread_followups,
    threadSubject: steps[0].subject,
    footer: campaign.footer,
    signature: loaded.row.signature,
    lead,
    sender: { from_name: loaded.row.from_name, email: loaded.row.email },
  });
  if (composed.missing.length) {
    return { ok: false, error: `The sample lead is missing ${composed.missing.join(", ")}. Real sends would be blocked too.` };
  }
  try {
    await smtpMailer.send(loaded.conn, {
      to: to.trim(),
      subject: `[TEST] ${composed.subject}`,
      text: composed.body,
      messageId: `<test-${randomUUID()}@${emailDomain(loaded.row.email)}>`,
    });
  } catch (e) {
    return { ok: false, error: `Send failed: ${errMessage(e)}` };
  }
  await supabase.from("campaigns").update({ test_sent_at: new Date().toISOString() }).eq("id", campaignId);
  revalidatePath(`/outbound/${campaignId}`);
  return { ok: true, data: { message: `Sent email ${stepIndex + 1} to ${to} from ${loaded.row.email}. Check inbox vs spam.` } };
}

// ---------------------------------------------------------------------
// Setup: domain checks, warmup, launch sign-offs
// ---------------------------------------------------------------------
/** Check SPF, DKIM, DMARC and MX for every sending domain (or one). */
export async function checkSendingDomains(only?: string): Promise<ActionResult<{ checked: number; failing: number }>> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("mailboxes").select("email, smtp_host");
  const byDomain = new Map<string, string>();
  for (const m of (data ?? []) as { email: string; smtp_host: string }[]) {
    const d = emailDomain(m.email);
    if (d && !byDomain.has(d)) byDomain.set(d, m.smtp_host);
  }
  const domains = Array.from(byDomain.keys()).filter((d) => !only || d === only);
  if (domains.length === 0) return { ok: false, error: "Add a sending inbox first." };

  let failing = 0;
  for (const d of domains) {
    const report = await checkDomain(d, providerFor(byDomain.get(d)!));
    if (!report.ok) failing++;
    const { error } = await supabase.from("domain_checks").upsert({
      domain: d,
      provider: report.provider,
      ok: report.ok,
      results: report,
      checked_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/outbound/setup");
  revalidatePath("/outbound");
  return { ok: true, data: { checked: domains.length, failing } };
}

export async function setWarmupStart(mailboxId: string, date: string | null): Promise<ActionResult> {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Use a date." };
  if (date && Date.parse(date) > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, error: "That date is in the future." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("mailboxes").update({ warmup_started_on: date }).eq("id", mailboxId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbound/setup");
  return { ok: true };
}

export async function setCampaignSignoff(
  campaignId: string,
  key: "copy_approved_at" | "list_verified_at",
  on: boolean
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("campaigns")
    .update({ [key]: on ? new Date().toISOString() : null })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/outbound/${campaignId}`);
  return { ok: true };
}
