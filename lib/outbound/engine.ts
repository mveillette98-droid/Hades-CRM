import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeEmail, normalizeSteps, type StepTemplate } from "./render";
import { followupAt, inWindow } from "./schedule";
import {
  bouncedRecipient,
  classifyInbound,
  emailDomain,
  extractAddress,
  stripQuoted,
} from "./classify";
import { isWarm } from "./readiness";
import type { FetchedEmail, Inbox, Mailer, MailboxConn } from "./transport";

/**
 * The sender. One `tick` does two jobs:
 *
 *   1. Send whatever is due: for every active campaign inside its send
 *      window, pick due leads (follow-ups first), give each one an inbox
 *      with capacity left, render the step, send it, schedule the next one.
 *   2. Read new mail on every inbox: replies stop the sequence, bounces and
 *      unsubscribes go on the suppression list, out-of-offices are ignored.
 *
 * Rules that keep inboxes healthy:
 *   - each inbox has a rolling 24h cap (daily_limit) and a minimum gap
 *     between sends, with jitter, so nothing goes out in bursts
 *   - a thread always stays on the inbox that sent email 1
 *   - follow-ups reply in the same thread unless the campaign turns it off
 *   - a missing merge tag blocks the send instead of sending "Hi ,"
 *   - an inbox isn't used until it has warmed for its minimum days
 *   - an inbox whose bounces pass 3% over 7 days pauses itself
 */

export interface EngineDeps {
  db: SupabaseClient;
  mailer: Mailer;
  inbox: Inbox;
  decrypt: (enc: string) => string;
  now?: () => Date;
  random?: () => number;
  log?: (msg: string) => void;
}

interface MailboxRow {
  id: string;
  email: string;
  from_name: string;
  username: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string | null;
  imap_port: number;
  signature: string | null;
  daily_limit: number;
  min_gap_seconds: number;
  status: "active" | "paused" | "error";
  warmup_started_on: string | null;
  warmup_min_days: number;
  last_sent_at: string | null;
  imap_uid_validity: number | null;
  imap_last_uid: number | null;
  last_checked_at: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  timezone: string;
  window_start: number;
  window_end: number;
  send_days: number[];
  thread_followups: boolean;
  footer: string | null;
  steps: StepTemplate[];
}

interface LeadRow {
  id: string;
  campaign_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  personal_line: string | null;
  fields: Record<string, unknown> | null;
  status: string;
  current_step: number;
  next_send_at: string;
  mailbox_id: string | null;
  thread_subject: string | null;
  last_message_id: string | null;
  message_ids: string[] | null;
  attempts: number;
  locked_until: string | null;
}

interface BoxState {
  row: MailboxRow;
  conn: MailboxConn | null;
  remaining: number;
  nextFreeAt: number;
}

export interface TickResult {
  sent: number;
  inbound: number;
  errors: string[];
}

const DUE_BATCH = 25;
const CHECK_EVERY_MS = 3 * 60 * 1000;
const CLAIM_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 4;
const BOUNCE_LIMIT = 0.03;
const BOUNCE_MIN_SENDS = 20;

export async function tick(deps: EngineDeps): Promise<TickResult> {
  const result: TickResult = { sent: 0, inbound: 0, errors: [] };
  const boxes = await loadMailboxes(deps, result);
  result.sent = await sendDue(deps, boxes, result);
  result.inbound = await checkInboxes(deps, boxes, result);
  await deps.db.from("outbound_worker").upsert({
    id: "sender",
    last_tick_at: now(deps).toISOString(),
    info: { sent: result.sent, inbound: result.inbound, errors: result.errors.slice(0, 5) },
  });
  return result;
}

function now(deps: EngineDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function log(deps: EngineDeps, msg: string) {
  (deps.log ?? console.log)(msg);
}

// ---------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------
async function loadMailboxes(deps: EngineDeps, result: TickResult): Promise<Map<string, BoxState>> {
  const { db } = deps;
  const t = now(deps).getTime();
  const { data: rows, error } = await db
    .from("mailboxes")
    .select("*")
    .in("status", ["active", "paused"]);
  if (error) throw new Error(`Loading mailboxes failed: ${error.message}`);

  const list = (rows ?? []) as MailboxRow[];
  const out = new Map<string, BoxState>();
  if (list.length === 0) return out;

  const { data: secrets } = await db
    .from("mailbox_secrets")
    .select("mailbox_id, password_enc")
    .in(
      "mailbox_id",
      list.map((b) => b.id)
    );
  const enc = new Map(
    ((secrets ?? []) as { mailbox_id: string; password_enc: string }[]).map((s) => [s.mailbox_id, s.password_enc])
  );

  const since = new Date(t - 24 * 60 * 60 * 1000).toISOString();
  for (const row of list) {
    let conn: MailboxConn | null = null;
    const secret = enc.get(row.id);
    if (!secret) {
      await markMailboxError(deps, row.id, "No password saved. Edit the mailbox and enter it.");
      result.errors.push(`${row.email}: no password`);
      continue;
    }
    try {
      conn = {
        id: row.id,
        email: row.email,
        from_name: row.from_name,
        username: row.username,
        password: deps.decrypt(secret),
        smtp_host: row.smtp_host,
        smtp_port: row.smtp_port,
        imap_host: row.imap_host,
        imap_port: row.imap_port,
      };
    } catch (e) {
      await markMailboxError(deps, row.id, `Can't decrypt the password (${(e as Error).message}). Re-enter it.`);
      result.errors.push(`${row.email}: decrypt failed`);
      continue;
    }

    const { count } = await db
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("mailbox_id", row.id)
      .eq("direction", "outbound")
      .eq("kind", "sent")
      .gte("sent_at", since);

    if (row.status === "active") await bounceGuard(deps, row, t);

    const lastSent = row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
    out.set(row.id, {
      row,
      conn,
      remaining: Math.max(0, row.daily_limit - (count ?? 0)),
      nextFreeAt: lastSent + row.min_gap_seconds * 1000,
    });
  }
  return out;
}

/** Pause an inbox whose bounce rate over the last 7 days passes 3%. */
async function bounceGuard(deps: EngineDeps, row: MailboxRow, t: number) {
  const { db } = deps;
  const week = new Date(t - 7 * 24 * 60 * 60 * 1000).toISOString();
  const count = async (kind: string) => {
    const { count } = await db
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("mailbox_id", row.id)
      .eq("kind", kind)
      .gte("sent_at", week);
    return count ?? 0;
  };
  const sent = await count("sent");
  if (sent < BOUNCE_MIN_SENDS) return;
  const bounced = await count("bounce");
  if (bounced / sent <= BOUNCE_LIMIT) return;
  const msg = `Paused automatically: ${bounced} bounces from ${sent} sends in 7 days (${Math.round((bounced / sent) * 1000) / 10}%, limit 3%). Clean the list, then resume.`;
  await db.from("mailboxes").update({ status: "paused", last_error: msg }).eq("id", row.id);
  row.status = "paused";
  log(deps, `${row.email}: ${msg}`);
}

async function markMailboxError(deps: EngineDeps, id: string, message: string) {
  await deps.db.from("mailboxes").update({ status: "error", last_error: message }).eq("id", id);
  log(deps, `mailbox ${id}: ${message}`);
}

function ready(box: BoxState | undefined, t: number): box is BoxState {
  return (
    !!box &&
    !!box.conn &&
    box.row.status === "active" &&
    isWarm(box.row, new Date(t)) &&
    box.remaining > 0 &&
    box.nextFreeAt <= t
  );
}

// ---------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------
async function sendDue(
  deps: EngineDeps,
  boxes: Map<string, BoxState>,
  result: TickResult
): Promise<number> {
  const { db } = deps;
  const { data: campaignRows } = await db.from("campaigns").select("*").eq("status", "active");
  const campaigns = shuffle((campaignRows ?? []) as CampaignRow[], deps);
  if (campaigns.length === 0) return 0;

  const { data: links } = await db
    .from("campaign_mailboxes")
    .select("campaign_id, mailbox_id")
    .in(
      "campaign_id",
      campaigns.map((c) => c.id)
    );

  let sent = 0;
  for (const c of campaigns) {
    const steps = normalizeSteps(c.steps ?? []);
    if (steps.length === 0) continue;
    const t = now(deps);
    if (!inWindow(t, c)) continue;

    const cBoxes = ((links ?? []) as { campaign_id: string; mailbox_id: string }[])
      .filter((l) => l.campaign_id === c.id)
      .map((l) => boxes.get(l.mailbox_id))
      .filter((b): b is BoxState => !!b);
    if (cBoxes.length === 0) continue;

    const { data: due } = await db
      .from("campaign_leads")
      .select("*")
      .eq("campaign_id", c.id)
      .in("status", ["queued", "active"])
      .lte("next_send_at", t.toISOString())
      .order("current_step", { ascending: false })
      .order("next_send_at", { ascending: true })
      .limit(DUE_BATCH);

    const leads = (due ?? []) as LeadRow[];
    if (leads.length === 0) {
      await maybeComplete(deps, c.id);
      continue;
    }

    for (const lead of leads) {
      const tt = now(deps).getTime();
      if (lead.locked_until && new Date(lead.locked_until).getTime() > tt) continue;
      const box = lead.mailbox_id
        ? cBoxes.find((b) => b.row.id === lead.mailbox_id)
        : cBoxes.filter((b) => ready(b, tt)).sort((a, b) => b.remaining - a.remaining)[0];
      if (!ready(box, tt)) continue;
      try {
        if (await sendOne(deps, c, steps, lead, box)) sent++;
      } catch (e) {
        result.errors.push(`${lead.email}: ${(e as Error).message}`);
        log(deps, `send to ${lead.email} crashed: ${(e as Error).message}`);
      }
    }
  }
  return sent;
}

async function isSuppressed(deps: EngineDeps, email: string): Promise<string | null> {
  const { db } = deps;
  const { data: byEmail } = await db
    .from("suppressions")
    .select("reason")
    .eq("email", email.toLowerCase())
    .limit(1);
  if (byEmail?.[0]) return (byEmail[0] as { reason: string }).reason;
  const { data: byDomain } = await db
    .from("suppressions")
    .select("reason")
    .eq("domain", emailDomain(email))
    .limit(1);
  if (byDomain?.[0]) return (byDomain[0] as { reason: string }).reason;
  return null;
}

async function suppress(deps: EngineDeps, email: string, reason: string) {
  // Unique index on lower(email): a duplicate insert just errors, which is fine.
  await deps.db.from("suppressions").insert({ email: email.toLowerCase(), reason });
}

async function sendOne(
  deps: EngineDeps,
  c: CampaignRow,
  steps: StepTemplate[],
  lead: LeadRow,
  box: BoxState
): Promise<boolean> {
  const { db } = deps;
  const t = now(deps);

  const suppressed = await isSuppressed(deps, lead.email);
  if (suppressed) {
    await db
      .from("campaign_leads")
      .update({
        status: suppressed === "bounced" ? "bounced" : "unsubscribed",
        last_error: `On the suppression list (${suppressed}).`,
      })
      .eq("id", lead.id);
    return false;
  }

  // Claim the lead so a second sender (or a double tick) can't send it twice.
  // Two tries (no lock, then an expired lock) instead of one .or(): PostgREST
  // re-applies or= filters to the updated row, so an .or() claim never succeeds.
  const claim = async (expired: boolean) => {
    const q = db
      .from("campaign_leads")
      .update({ locked_until: new Date(t.getTime() + CLAIM_MS).toISOString() })
      .eq("id", lead.id)
      .eq("current_step", lead.current_step)
      .in("status", ["queued", "active"]);
    const { data } = await (expired ? q.lt("locked_until", t.toISOString()) : q.is("locked_until", null)).select("id");
    return (data ?? []).length > 0;
  };
  if (!(await claim(false)) && !(await claim(true))) return false;

  const idx = lead.current_step;
  if (idx >= steps.length) {
    await db.from("campaign_leads").update({ status: "completed", locked_until: null }).eq("id", lead.id);
    return false;
  }
  const step = steps[idx];
  const conn = box.conn!;

  const composed = composeEmail({
    steps,
    stepIndex: idx,
    threadFollowups: c.thread_followups,
    threadSubject: lead.thread_subject,
    footer: c.footer,
    signature: box.row.signature,
    lead,
    sender: { from_name: box.row.from_name, email: box.row.email },
  });
  if (composed.missing.length > 0) {
    await db
      .from("campaign_leads")
      .update({
        status: "failed",
        locked_until: null,
        last_error: `Missing ${composed.missing.join(", ")}. Add it to the lead or use a fallback like {{${composed.missing[0]}|there}}.`,
      })
      .eq("id", lead.id);
    return false;
  }

  const threaded = idx > 0 && c.thread_followups && !!lead.last_message_id;
  const messageId = `<${randomUUID()}@${emailDomain(box.row.email) || "cadence.local"}>`;
  try {
    await deps.mailer.send(conn, {
      to: lead.email,
      subject: composed.subject,
      text: composed.body,
      messageId,
      inReplyTo: threaded ? lead.last_message_id : null,
      references: threaded ? lead.message_ids ?? [] : [],
    });
  } catch (e) {
    await handleSendError(deps, box, lead, e);
    return false;
  }

  const sentAt = now(deps);
  const { error: logError } = await db.from("email_messages").insert({
    campaign_id: c.id,
    lead_id: lead.id,
    mailbox_id: box.row.id,
    direction: "outbound",
    kind: "sent",
    step: step.step,
    message_id: messageId,
    in_reply_to: threaded ? lead.last_message_id : null,
    from_email: box.row.email,
    to_email: lead.email,
    subject: composed.subject,
    body_text: composed.body,
    sent_at: sentAt.toISOString(),
  });
  if (logError) log(deps, `SENT but not logged (${lead.email}): ${logError.message}`);

  const isLast = idx + 1 >= steps.length;
  const jitter = Math.floor(rand(deps) * 90);
  const next = isLast ? sentAt : followupAt(sentAt, step.day, steps[idx + 1].day, jitter);
  await db
    .from("campaign_leads")
    .update({
      current_step: idx + 1,
      status: isLast ? "completed" : "active",
      mailbox_id: box.row.id,
      thread_subject: lead.thread_subject ?? composed.subject,
      last_message_id: messageId,
      message_ids: [...(lead.message_ids ?? []), messageId],
      next_send_at: next.toISOString(),
      attempts: 0,
      last_error: null,
      locked_until: null,
    })
    .eq("id", lead.id);

  box.remaining -= 1;
  box.nextFreeAt = sentAt.getTime() + box.row.min_gap_seconds * 1000 * (1 + rand(deps) * 0.5);
  box.row.last_sent_at = sentAt.toISOString();
  await db.from("mailboxes").update({ last_sent_at: sentAt.toISOString(), last_error: null }).eq("id", box.row.id);

  log(deps, `sent step ${step.step}/${steps.length} to ${lead.email} from ${box.row.email} (${c.name})`);
  return true;
}

async function handleSendError(deps: EngineDeps, box: BoxState, lead: LeadRow, err: unknown) {
  const { db } = deps;
  const e = err as { code?: string; responseCode?: number; message?: string; response?: string };
  const msg = (e.response || e.message || String(err)).slice(0, 500);
  const code = e.responseCode ?? 0;
  const t = now(deps).getTime();
  const unlock = { locked_until: null };

  // The inbox can't log in: stop using it until someone fixes it.
  if (e.code === "EAUTH" || code === 535 || code === 534) {
    await markMailboxError(deps, box.row.id, `Login failed: ${msg}`);
    box.conn = null;
    await db.from("campaign_leads").update(unlock).eq("id", lead.id);
    return;
  }

  // Provider says this inbox hit its own sending limit.
  if (/quota|limit exceeded|rate limit|too many/i.test(msg)) {
    box.remaining = 0;
    await db.from("mailboxes").update({ last_error: `Provider limit hit: ${msg}` }).eq("id", box.row.id);
    await db
      .from("campaign_leads")
      .update({ ...unlock, next_send_at: new Date(t + 60 * 60 * 1000).toISOString() })
      .eq("id", lead.id);
    log(deps, `${box.row.email} hit a provider limit, pausing it for this round`);
    return;
  }

  // The address is dead: hard bounce at send time.
  if ([550, 551, 553].includes(code) || (code === 554 && /recipient|address|user|mailbox/i.test(msg))) {
    await db
      .from("campaign_leads")
      .update({ ...unlock, status: "bounced", last_error: msg })
      .eq("id", lead.id);
    await suppress(deps, lead.email, "bounced");
    await db.from("email_messages").insert({
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      mailbox_id: box.row.id,
      direction: "inbound",
      kind: "bounce",
      from_email: box.row.email,
      to_email: lead.email,
      subject: "Rejected at send",
      body_text: msg,
      handled: true,
    });
    log(deps, `${lead.email} rejected (${code}), suppressed`);
    return;
  }

  // Anything else: try again later, give up after a few tries.
  const attempts = (lead.attempts ?? 0) + 1;
  await db
    .from("campaign_leads")
    .update({
      ...unlock,
      attempts,
      last_error: msg,
      status: attempts >= MAX_ATTEMPTS ? "failed" : lead.status,
      next_send_at: new Date(t + 30 * 60 * 1000).toISOString(),
    })
    .eq("id", lead.id);
  box.nextFreeAt = t + 10 * 60 * 1000;
  log(deps, `send to ${lead.email} failed (attempt ${attempts}): ${msg}`);
}

async function maybeComplete(deps: EngineDeps, campaignId: string) {
  const { db } = deps;
  const { count: open } = await db
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "active"]);
  if ((open ?? 0) > 0) return;
  const { count: total } = await db
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if ((total ?? 0) === 0) return;
  await db.from("campaigns").update({ status: "completed" }).eq("id", campaignId).eq("status", "active");
}

// ---------------------------------------------------------------------
// Replies, bounces, unsubscribes
// ---------------------------------------------------------------------
async function checkInboxes(
  deps: EngineDeps,
  boxes: Map<string, BoxState>,
  result: TickResult
): Promise<number> {
  const { db } = deps;
  let handled = 0;
  for (const box of Array.from(boxes.values())) {
    if (!box.conn || !box.row.imap_host) continue;
    const t = now(deps).getTime();
    const last = box.row.last_checked_at ? new Date(box.row.last_checked_at).getTime() : 0;
    if (t - last < CHECK_EVERY_MS) continue;

    try {
      const res = await deps.inbox.fetchNew(box.conn, {
        uidValidity: box.row.imap_uid_validity,
        lastUid: box.row.imap_last_uid,
      });
      for (const m of res.messages) {
        try {
          if (await handleInbound(deps, box.row, m)) handled++;
        } catch (e) {
          result.errors.push(`inbound on ${box.row.email}: ${(e as Error).message}`);
        }
      }
      await db
        .from("mailboxes")
        .update({
          imap_uid_validity: res.uidValidity,
          imap_last_uid: res.lastUid,
          last_checked_at: new Date(t).toISOString(),
        })
        .eq("id", box.row.id);
    } catch (e) {
      const err = e as { authenticationFailed?: boolean; message?: string };
      if (err.authenticationFailed) {
        await markMailboxError(deps, box.row.id, `IMAP login failed: ${err.message}`);
        box.conn = null;
      } else {
        await db.from("mailboxes").update({ last_checked_at: new Date(t).toISOString() }).eq("id", box.row.id);
        log(deps, `checking ${box.row.email} failed: ${err.message}`);
      }
      result.errors.push(`imap ${box.row.email}: ${err.message}`);
    }
  }
  return handled;
}

export async function handleInbound(
  deps: EngineDeps,
  box: Pick<MailboxRow, "id" | "email">,
  m: FetchedEmail
): Promise<boolean> {
  const { db } = deps;
  const from = extractAddress(m.from);
  if (from === box.email.toLowerCase()) return false;

  if (m.messageId) {
    const { data: seen } = await db.from("email_messages").select("id").eq("message_id", m.messageId).limit(1);
    if (seen && seen.length > 0) return false;
  }

  const kind = classifyInbound(m);

  // Which lead is this about? Thread headers first, then the bounced
  // address, then the sender's address on this inbox.
  let leadId: string | null = null;
  const ids = [m.inReplyTo, ...m.references].filter((x): x is string => !!x);
  if (ids.length > 0) {
    const { data } = await db
      .from("email_messages")
      .select("lead_id")
      .eq("direction", "outbound")
      .in("message_id", ids)
      .not("lead_id", "is", null)
      .limit(1);
    leadId = (data?.[0] as { lead_id: string } | undefined)?.lead_id ?? null;
  }
  if (!leadId && kind === "bounce") {
    const rcpt = bouncedRecipient(m.text);
    if (rcpt) leadId = await leadByEmail(deps, rcpt, box.id);
  }
  if (!leadId && kind !== "bounce") leadId = await leadByEmail(deps, from, box.id);
  if (!leadId) return false; // not about one of our campaigns

  const { data: leadRow } = await db
    .from("campaign_leads")
    .select("id, campaign_id, email, status")
    .eq("id", leadId)
    .maybeSingle();
  const lead = leadRow as { id: string; campaign_id: string; email: string; status: string } | null;
  if (!lead) return false;

  const fresh = stripQuoted(m.text);
  await db.from("email_messages").insert({
    campaign_id: lead.campaign_id,
    lead_id: lead.id,
    mailbox_id: box.id,
    direction: "inbound",
    kind,
    message_id: m.messageId,
    in_reply_to: m.inReplyTo,
    from_email: from,
    to_email: box.email,
    subject: m.subject.slice(0, 500),
    body_text: (fresh || m.text).slice(0, 20_000),
    // Unsubscribes are handled on arrival (suppressed); there is nothing to tag.
    handled: kind === "auto_reply" || kind === "bounce" || kind === "unsubscribe",
    sent_at: (m.date ?? now(deps)).toISOString(),
  });

  const final = ["replied", "unsubscribed", "bounced"];
  if (kind === "reply" && !final.includes(lead.status)) {
    await db.from("campaign_leads").update({ status: "replied", locked_until: null }).eq("id", lead.id);
  } else if (kind === "unsubscribe") {
    await db.from("campaign_leads").update({ status: "unsubscribed", locked_until: null }).eq("id", lead.id);
    await suppress(deps, lead.email, "unsubscribed");
  } else if (kind === "bounce") {
    await db.from("campaign_leads").update({ status: "bounced", locked_until: null }).eq("id", lead.id);
    await suppress(deps, lead.email, "bounced");
  }
  log(deps, `${kind} from ${from} on ${box.email}`);
  return true;
}

async function leadByEmail(deps: EngineDeps, email: string, mailboxId: string): Promise<string | null> {
  const { data } = await deps.db
    .from("campaign_leads")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("mailbox_id", mailboxId)
    .order("updated_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

// ---------------------------------------------------------------------
function rand(deps: EngineDeps): number {
  return deps.random ? deps.random() : Math.random();
}

function shuffle<T>(items: T[], deps: EngineDeps): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(deps) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
