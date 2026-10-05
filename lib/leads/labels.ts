import type { DealType, LeadSource } from "@/lib/supabase/types";

export const DEAL_TYPES: { value: DealType; label: string; short: string }[] = [
  { value: "outbound_retainer", label: "Outbound Retainer",   short: "Outbound" },
  { value: "gtm_setup",         label: "GTM Setup",           short: "Setup" },
  { value: "content_retainer",  label: "Content Retainer",    short: "Content" },
  { value: "paid_ads",          label: "Paid Ads",            short: "Ads" },
  { value: "full_gtm",          label: "Full GTM",            short: "Full GTM" },
  { value: "other",             label: "Other",               short: "Other" },
];

export const DEAL_TYPE_LABEL: Record<DealType, string> = Object.fromEntries(
  DEAL_TYPES.map((t) => [t.value, t.label])
) as Record<DealType, string>;

export const DEAL_TYPE_SHORT: Record<DealType, string> = Object.fromEntries(
  DEAL_TYPES.map((t) => [t.value, t.short])
) as Record<DealType, string>;

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "cold_call",     label: "Cold Call" },
  { value: "cold_email",    label: "Cold Email" },
  { value: "linkedin",      label: "LinkedIn" },
  { value: "instagram",     label: "Instagram" },
  { value: "tiktok",        label: "TikTok" },
  { value: "referral",      label: "Referral" },
  { value: "network",       label: "Network" },
  { value: "website_form",  label: "Website Form" },
  { value: "other",         label: "Other" },
];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = Object.fromEntries(
  LEAD_SOURCES.map((s) => [s.value, s.label])
) as Record<LeadSource, string>;

export function dealEmphasis(deal: DealType): "one_time" | "mrr" | "both" {
  if (deal === "gtm_setup") return "one_time";
  if (deal === "full_gtm") return "both";
  if (deal === "other") return "both";
  return "mrr";
}

export const VERTICALS: readonly string[] = [
  "Accounting / CAS",
  "Bookkeeping",
  "Tax",
  "Fractional CFO",
  "Legal",
  "B2B SaaS",
  "Other",
] as const;
