/**
 * Merge tags. {{first_name}}, {{company}}, {{personal_line}}, any CSV column
 * as {{column_name}}, and fallbacks: {{first_name|there}}.
 *
 * A tag with no value and no fallback blocks the send, so nobody gets
 * "Hi {{first_name}}" or "Hi ,". The one exception is {{personal_line}}:
 * if it's empty the line is dropped.
 */
const TAG = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g;
const OPTIONAL = new Set(["personal_line"]);

export interface LeadVars {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  personal_line?: string | null;
  fields?: Record<string, unknown> | null;
}

export interface SenderVars {
  from_name: string;
  email: string;
}

export function templateVars(lead: LeadVars, sender: SenderVars): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(lead.fields ?? {})) {
    if (v != null && String(v).trim()) vars[k.toLowerCase()] = String(v).trim();
  }
  const set = (k: string, v: string | null | undefined) => {
    if (v && v.trim()) vars[k] = v.trim();
  };
  set("email", lead.email);
  set("first_name", lead.first_name);
  set("last_name", lead.last_name);
  set("company", lead.company);
  set("company_name", lead.company);
  set("title", lead.title);
  set("personal_line", lead.personal_line);
  set("sender_name", sender.from_name);
  set("sender_first_name", sender.from_name.split(" ")[0]);
  set("sender_email", sender.email);
  // Common aliases the writers or a CSV might use.
  if (!vars.firstname && vars.first_name) vars.firstname = vars.first_name;
  if (!vars.companyname && vars.company) vars.companyname = vars.company;
  return vars;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = template.replace(TAG, (_m, rawName: string, fallback?: string) => {
    const name = rawName.toLowerCase();
    const value = vars[name];
    if (value) return value;
    if (fallback !== undefined) return fallback.trim();
    if (OPTIONAL.has(name)) return "";
    missing.add(name);
    return "";
  });
  return { text: tidy(text), missing: Array.from(missing) };
}

/** Drop lines a removed tag left empty, keep paragraph breaks. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\n/, "")
    .trim();
}

export interface StepTemplate {
  step: number;
  day: number;
  subject: string;
  body: string;
}

export interface ComposeInput {
  steps: StepTemplate[];
  stepIndex: number;            // 0-based
  threadFollowups: boolean;
  threadSubject: string | null; // subject of email 1 as sent
  footer: string | null;
  signature: string | null;
  lead: LeadVars;
  sender: SenderVars;
}

export function composeEmail(input: ComposeInput): {
  subject: string;
  body: string;
  missing: string[];
} {
  const step = input.steps[input.stepIndex];
  const vars = templateVars(input.lead, input.sender);
  const body = renderTemplate(step.body, vars);

  let subject: { text: string; missing: string[] };
  if (input.stepIndex > 0 && input.threadFollowups && input.threadSubject) {
    subject = {
      text: /^re:/i.test(input.threadSubject) ? input.threadSubject : `Re: ${input.threadSubject}`,
      missing: [],
    };
  } else {
    subject = renderTemplate(step.subject, vars);
  }

  const parts = [body.text];
  if (input.signature?.trim()) parts.push(renderTemplate(input.signature, vars).text);
  if (input.footer?.trim()) parts.push(renderTemplate(input.footer, vars).text);

  return {
    subject: subject.text,
    body: parts.join("\n\n"),
    missing: Array.from(new Set([...subject.missing, ...body.missing])),
  };
}

/** Steps sorted, renumbered, with days that never go backwards. */
export function normalizeSteps(steps: StepTemplate[]): StepTemplate[] {
  const sorted = [...steps]
    .filter((s) => s.body?.trim())
    .sort((a, b) => a.day - b.day || a.step - b.step);
  let lastDay = 1;
  return sorted.map((s, i) => {
    const day = Math.max(i === 0 ? 1 : lastDay + 1, Math.round(s.day) || 1);
    lastDay = day;
    return { step: i + 1, day, subject: s.subject ?? "", body: s.body };
  });
}
