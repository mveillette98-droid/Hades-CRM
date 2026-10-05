import { emailDomain } from "./classify";
import { normalizeSteps, type StepTemplate } from "./render";

/**
 * The launch checklist. A campaign can't start while anything here is
 * "fail"; "warn" is advice. The same rules run in the UI and in the server
 * action that starts a campaign, so the button can't be bypassed.
 */

export type ItemStatus = "pass" | "warn" | "fail";

export interface ChecklistItem {
  key: string;
  label: string;
  status: ItemStatus;
  detail: string;
}

export interface ReadinessMailbox {
  id: string;
  email: string;
  status: "active" | "paused" | "error";
  verified_at: string | null;
  warmup_started_on: string | null;
  warmup_min_days: number;
  daily_limit: number;
}

export interface ReadinessDomain {
  domain: string;
  ok: boolean;
  checked_at: string;
}

export interface ReadinessInput {
  campaign: {
    steps: StepTemplate[];
    footer: string | null;
    copy_approved_at: string | null;
    list_verified_at: string | null;
    test_sent_at: string | null;
  };
  mailboxes: ReadinessMailbox[]; // the ones picked for this campaign
  domains: ReadinessDomain[];
  openLeads: number; // queued + active
  verifiedLeads?: number; // open leads whose contact passed email verification
  clientDomain: string | null;
  now?: Date;
}

const DAY = 24 * 60 * 60 * 1000;
const STALE_DNS_DAYS = 7;

export function warmupDays(startedOn: string | null, now = new Date()): number | null {
  if (!startedOn) return null;
  const start = Date.parse(`${startedOn.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / DAY));
}

export function isWarm(m: Pick<ReadinessMailbox, "warmup_started_on" | "warmup_min_days">, now = new Date()): boolean {
  const days = warmupDays(m.warmup_started_on, now);
  return days !== null && days >= m.warmup_min_days;
}

const list = (xs: string[]) => (xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);

export function launchChecklist(input: ReadinessInput): { items: ChecklistItem[]; canStart: boolean } {
  const now = input.now ?? new Date();
  const c = input.campaign;
  const steps = normalizeSteps(c.steps ?? []);
  const boxes = input.mailboxes;
  const items: ChecklistItem[] = [];
  const add = (key: string, label: string, status: ItemStatus, detail: string) =>
    items.push({ key, label, status, detail });

  // Copy
  if (steps.length === 0 || !steps[0].subject.trim()) {
    add("emails", "Emails written", "fail", "Email 1 needs a subject and a body.");
  } else {
    add("emails", "Emails written", "pass", `${steps.length} ${steps.length === 1 ? "email" : "emails"} over ${steps.at(-1)!.day} days.`);
  }
  add(
    "copy",
    "Copy approved",
    c.copy_approved_at ? "pass" : "fail",
    c.copy_approved_at ? "You've read every email." : "Read every email as the prospect would, then tick the box. Editing the emails clears it."
  );

  // Inboxes
  const active = boxes.filter((b) => b.status === "active");
  if (active.length === 0) {
    add("inboxes", "Sending inboxes", "fail", boxes.length ? "Every picked inbox is paused or broken." : "Pick at least one inbox in Settings.");
  } else {
    add("inboxes", "Sending inboxes", "pass", `${active.length} ${active.length === 1 ? "inbox" : "inboxes"}, up to ${active.reduce((s, b) => s + b.daily_limit, 0)} sends a day.`);
  }

  const untested = boxes.filter((b) => b.status === "error" || !b.verified_at).map((b) => b.email);
  add(
    "logins",
    "Inbox logins tested",
    untested.length ? "fail" : boxes.length ? "pass" : "fail",
    untested.length ? `Hit Test on ${list(untested)} (Outbound > Setup).` : boxes.length ? "Every inbox can send and read replies." : "No inboxes picked yet."
  );

  const domains = Array.from(new Set(boxes.map((b) => emailDomain(b.email))));
  const byDomain = new Map(input.domains.map((d) => [d.domain, d]));
  const unchecked = domains.filter((d) => !byDomain.has(d));
  const failing = domains.filter((d) => byDomain.get(d) && !byDomain.get(d)!.ok);
  const stale = domains.filter((d) => {
    const r = byDomain.get(d);
    return r && r.ok && now.getTime() - Date.parse(r.checked_at) > STALE_DNS_DAYS * DAY;
  });
  if (domains.length === 0) {
    add("dns", "Domain records (SPF, DKIM, DMARC, MX)", "fail", "No sending domains yet.");
  } else if (unchecked.length || failing.length) {
    const parts = [];
    if (failing.length) parts.push(`fix ${list(failing)}`);
    if (unchecked.length) parts.push(`run the check on ${list(unchecked)}`);
    add("dns", "Domain records (SPF, DKIM, DMARC, MX)", "fail", `On Setup: ${parts.join(", and ")}.`);
  } else if (stale.length) {
    add("dns", "Domain records (SPF, DKIM, DMARC, MX)", "warn", `Last checked over ${STALE_DNS_DAYS} days ago for ${list(stale)}. Check again before you start.`);
  } else {
    add("dns", "Domain records (SPF, DKIM, DMARC, MX)", "pass", `${list(domains)} pass.`);
  }

  const cold = boxes
    .filter((b) => !isWarm(b, now))
    .map((b) => {
      const days = warmupDays(b.warmup_started_on, now);
      return days === null ? `${b.email} (no start date)` : `${b.email} (${days} of ${b.warmup_min_days} days)`;
    });
  add(
    "warmup",
    "Inboxes warmed up",
    cold.length || boxes.length === 0 ? "fail" : "pass",
    cold.length
      ? `Still warming: ${list(cold)}. Sending cold inboxes is how domains get burned.`
      : boxes.length
        ? "Every inbox has done its warmup days. Keep warmup running while you send."
        : "No inboxes picked yet."
  );

  const onMain = input.clientDomain ? domains.filter((d) => d === input.clientDomain) : [];
  if (onMain.length) {
    add("main-domain", "Not the client's main domain", "fail", `${onMain[0]} is the client's real domain. A spam complaint there hits their day-to-day email. Use a look-alike sending domain.`);
  }

  const hot = boxes.filter((b) => b.daily_limit > 30).map((b) => `${b.email} (${b.daily_limit})`);
  if (hot.length) {
    add("limits", "Daily limits", "warn", `Over 30 a day: ${list(hot)}. Fine for an inbox that's months old, risky for a new one.`);
  }

  // List
  add(
    "leads",
    "Leads imported",
    input.openLeads > 0 ? "pass" : "fail",
    input.openLeads > 0 ? `${input.openLeads.toLocaleString("en-US")} leads waiting.` : "Import leads first."
  );
  const allVerified = input.openLeads > 0 && (input.verifiedLeads ?? 0) >= input.openLeads;
  add(
    "verified",
    "List verified",
    c.list_verified_at || allVerified ? "pass" : "fail",
    allVerified
      ? "Every lead's email passed verification in Contacts."
      : c.list_verified_at
      ? "Emails were verified before import."
      : `${(input.verifiedLeads ?? 0).toLocaleString("en-US")} of ${input.openLeads.toLocaleString("en-US")} leads verified. Verify them in Contacts, or verify the list elsewhere and tick the box. Bounces over 3% burn inboxes.`
  );

  // Last look
  add(
    "test",
    "Test email sent",
    c.test_sent_at ? "pass" : "fail",
    c.test_sent_at ? "You've seen it land in an inbox." : "Send yourself a test and check it in Gmail: inbox or spam, and how it reads on a phone."
  );
  if (!c.footer?.trim()) {
    add("opt-out", "Opt-out line", "warn", "No footer. Add a line like \"Not the right person? Just let me know.\" Giving people an easy out cuts spam complaints.");
  }

  return { items, canStart: !items.some((i) => i.status === "fail") };
}
