import nodemailer, { type Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { InboundEmail } from "./classify";

/**
 * The two things the sender needs from a mailbox: send over SMTP, read new
 * mail over IMAP. Kept behind small interfaces so the engine can be tested
 * without a real inbox.
 */
export interface MailboxConn {
  id: string;
  email: string;
  from_name: string;
  username: string;
  password: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string | null;
  imap_port: number;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
}

export interface Mailer {
  send(box: MailboxConn, email: OutgoingEmail): Promise<void>;
  verify(box: MailboxConn): Promise<void>;
}

export interface FetchedEmail extends InboundEmail {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  date: Date | null;
}

export interface InboxCursor {
  uidValidity: number | null;
  lastUid: number | null;
}

export interface Inbox {
  fetchNew(box: MailboxConn, cursor: InboxCursor): Promise<{
    uidValidity: number;
    lastUid: number;
    messages: FetchedEmail[];
  }>;
  verify(box: MailboxConn): Promise<void>;
}

// ---------------------------------------------------------------------
// SMTP (nodemailer)
// ---------------------------------------------------------------------
const transports = new Map<string, { key: string; t: Transporter }>();

function transportFor(box: MailboxConn): Transporter {
  const key = `${box.smtp_host}:${box.smtp_port}:${box.username}:${box.password}`;
  const cached = transports.get(box.id);
  if (cached && cached.key === key) return cached.t;
  const t = nodemailer.createTransport({
    host: box.smtp_host,
    port: box.smtp_port,
    secure: box.smtp_port === 465,
    requireTLS: box.smtp_port !== 465,
    auth: { user: box.username, pass: box.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  transports.set(box.id, { key, t });
  return t;
}

export const smtpMailer: Mailer = {
  async send(box, email) {
    await transportFor(box).sendMail({
      from: { name: box.from_name, address: box.email },
      to: email.to,
      subject: email.subject,
      text: email.text,
      messageId: email.messageId,
      inReplyTo: email.inReplyTo ?? undefined,
      references: email.references?.length ? email.references : undefined,
      headers: { "List-Unsubscribe": `<mailto:${box.email}?subject=unsubscribe>` },
    });
  },
  async verify(box) {
    await transportFor(box).verify();
  },
};

// ---------------------------------------------------------------------
// IMAP (imapflow + mailparser)
// ---------------------------------------------------------------------
const MAX_PER_CHECK = 200;

function imapClient(box: MailboxConn): ImapFlow {
  if (!box.imap_host) throw new Error("No IMAP host set for this mailbox.");
  return new ImapFlow({
    host: box.imap_host,
    port: box.imap_port,
    secure: box.imap_port === 993,
    auth: { user: box.username, pass: box.password },
    logger: false,
    socketTimeout: 60_000,
  });
}

function headerMap(headers: Map<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    if (v == null) return;
    if (typeof v === "string") out[k.toLowerCase()] = v;
    else if (typeof v === "object" && "value" in (v as object)) {
      const val = (v as { value: unknown; params?: Record<string, string> }).value;
      const params = (v as { params?: Record<string, string> }).params;
      out[k.toLowerCase()] =
        String(val) + (params ? Object.entries(params).map(([p, pv]) => `; ${p}=${pv}`).join("") : "");
    } else out[k.toLowerCase()] = String(v);
  });
  return out;
}

export const imapInbox: Inbox = {
  async fetchNew(box, cursor) {
    const client = imapClient(box);
    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mb = client.mailbox;
        if (!mb) throw new Error("Could not open INBOX.");
        const uidValidity = Number(mb.uidValidity);
        const top = Math.max(0, Number(mb.uidNext) - 1);

        // First check, or the server reset its UIDs: start from now, don't
        // re-read the whole inbox.
        if (cursor.lastUid == null || cursor.uidValidity !== uidValidity) {
          return { uidValidity, lastUid: top, messages: [] };
        }
        if (top <= cursor.lastUid) return { uidValidity, lastUid: cursor.lastUid, messages: [] };

        const messages: FetchedEmail[] = [];
        let lastUid = cursor.lastUid;
        for await (const m of client.fetch(
          `${cursor.lastUid + 1}:*`,
          { uid: true, source: true },
          { uid: true }
        )) {
          if (m.uid <= cursor.lastUid || !m.source) continue;
          lastUid = Math.max(lastUid, m.uid);
          const parsed = await simpleParser(m.source);
          const refs = parsed.references;
          messages.push({
            uid: m.uid,
            messageId: parsed.messageId ?? null,
            inReplyTo: parsed.inReplyTo ?? null,
            references: Array.isArray(refs) ? refs : refs ? [refs] : [],
            from: parsed.from?.text ?? "",
            subject: parsed.subject ?? "",
            text: parsed.text ?? "",
            headers: headerMap(parsed.headers as Map<string, unknown>),
            date: parsed.date ?? null,
          });
          if (messages.length >= MAX_PER_CHECK) break;
        }
        return { uidValidity, lastUid, messages };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
  async verify(box) {
    const client = imapClient(box);
    await client.connect();
    await client.logout().catch(() => undefined);
  },
};

/** Presets for the add-mailbox form. */
export const PROVIDERS = {
  google: { label: "Google Workspace / Gmail", smtp_host: "smtp.gmail.com", smtp_port: 465, imap_host: "imap.gmail.com", imap_port: 993 },
  microsoft: { label: "Microsoft 365 / Outlook", smtp_host: "smtp.office365.com", smtp_port: 587, imap_host: "outlook.office365.com", imap_port: 993 },
  zoho: { label: "Zoho Mail", smtp_host: "smtp.zoho.com", smtp_port: 465, imap_host: "imap.zoho.com", imap_port: 993 },
  custom: { label: "Other (custom SMTP / IMAP)", smtp_host: "", smtp_port: 465, imap_host: "", imap_port: 993 },
} as const;
