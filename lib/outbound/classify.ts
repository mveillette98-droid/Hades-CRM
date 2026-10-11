/**
 * Sort an incoming email: a real reply, an out-of-office, an unsubscribe,
 * or a bounce. Conservative on purpose: when unsure it's a reply, which
 * stops the sequence and lands in front of a human.
 */
export type InboundKind = "reply" | "auto_reply" | "unsubscribe" | "bounce";

export interface InboundEmail {
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery (subsystem|system)|microsoftexchange)/i;
const BOUNCE_SUBJECT =
  /(undeliverable|undelivered mail|delivery status notification|delivery has failed|mail delivery failed|returned mail|failure notice|could ?n[o']t be delivered|address not found)/i;
const AUTO_SUBJECT = /^(auto(matic)?[ -]?reply|out of (the )?office|ooo\b|away from|on vacation|autoreply|abwesenheit)/i;
const UNSUB =
  /\b(unsubscribe|remove me|take me off|stop (emailing|e-mailing|contacting|sending)|opt[ -]?out|do not (contact|email)|don'?t (contact|email) me|not interested,? (please )?remove)\b/i;

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s.+/i.test(line.trim()) && out.length > 0) break;
    if (/^_{8,}$/.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function classifyInbound(msg: InboundEmail): InboundKind {
  const h = (k: string) => (msg.headers[k.toLowerCase()] ?? "").toLowerCase();
  const contentType = h("content-type");

  if (
    BOUNCE_FROM.test(msg.from) ||
    contentType.includes("report-type=delivery-status") ||
    (BOUNCE_SUBJECT.test(msg.subject) && /(delivery|recipient|address|mailbox)/i.test(msg.text))
  ) {
    return "bounce";
  }

  const autoSubmitted = h("auto-submitted");
  if (
    (autoSubmitted && autoSubmitted !== "no") ||
    h("x-autoreply") ||
    h("x-autorespond") ||
    /auto_reply/.test(h("precedence")) ||
    AUTO_SUBJECT.test(msg.subject.trim())
  ) {
    return "auto_reply";
  }

  const fresh = stripQuoted(msg.text).slice(0, 400);
  if (/unsubscribe/i.test(msg.subject) || UNSUB.test(fresh)) return "unsubscribe";

  return "reply";
}

/** Pull the address that bounced out of a delivery failure notice. */
export function bouncedRecipient(text: string): string | null {
  const patterns = [
    /Final-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/i,
    /Original-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/i,
    /(?:wasn'?t delivered to|delivery to the following recipient[s]? failed[^:]*:|could not be delivered to|address couldn'?t be found[^\n]*\n?[^\n]*?|your message to)\s*<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].toLowerCase().replace(/[.,;]+$/, "");
  }
  return null;
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function extractAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}
