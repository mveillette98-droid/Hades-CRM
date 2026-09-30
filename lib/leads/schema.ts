import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const moneyInput = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const cleaned = v.replace(/[^0-9.-]/g, "");
    const n = Number.parseFloat(cleaned || "0");
    return Number.isFinite(n) ? n : 0;
  })
  .pipe(z.number().min(0, "Must be zero or more"));

export const leadSchema = z.object({
  contact_name: z.string().trim().min(1, "Contact name is required"),
  company_name: z.string().trim().min(1, "Company name is required"),
  phone: optionalString,
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  website_url: optionalString,
  vertical: optionalString,
  deal_type: z.enum([
    "outbound_retainer",
    "gtm_setup",
    "content_retainer",
    "paid_ads",
    "full_gtm",
    "other",
  ]),
  one_time_value: moneyInput.default(0),
  monthly_recurring_value: moneyInput.default(0),
  stage_id: z.string().uuid("Stage is required"),
  source: z.enum([
    "cold_call",
    "cold_email",
    "linkedin",
    "instagram",
    "tiktok",
    "referral",
    "network",
    "website_form",
    "other",
  ]),
  scope_notes: optionalString,
  assigned_to: optionalUuid,
  next_followup_date: optionalDate,
  proposal_sent_date: optionalDate,
  expected_close_date: optionalDate,
  actual_close_date: optionalDate,
});

export type LeadInput = z.input<typeof leadSchema>;
export type LeadValues = z.output<typeof leadSchema>;
