import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const int = (min: number, max: number, fallback: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? n : fallback;
    })
    .pipe(z.number().int().min(min).max(max));

export const mailboxSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  from_name: z.string().trim().min(1, "Sender name is required"),
  username: optionalText,
  password: z.string().optional(),
  smtp_host: z.string().trim().min(1, "SMTP host is required"),
  smtp_port: int(1, 65535, 465),
  imap_host: optionalText,
  imap_port: int(1, 65535, 993),
  daily_limit: int(1, 500, 30),
  min_gap_seconds: int(30, 3600, 300),
  signature: optionalText,
  client_id: optionalText,
  warmup_started_on: optionalText.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date"),
});

export const campaignSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  timezone: z.string().trim().min(1),
  window_start: int(0, 23, 8),
  window_end: int(1, 24, 17),
  thread_followups: z.boolean(),
  footer: optionalText,
  send_days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day"),
  mailbox_ids: z.array(z.string().uuid()),
});

export const stepsSchema = z
  .array(
    z.object({
      step: z.number().int(),
      day: z.number().int().min(1).max(90),
      subject: z.string(),
      body: z.string().trim().min(1, "Every step needs a body"),
    })
  )
  .min(1, "Add at least one email")
  .max(10);
