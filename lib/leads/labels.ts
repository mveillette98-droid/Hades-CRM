import type { DealType, LeadSource } from "@/lib/supabase/types";

export const DEAL_TYPES: { value: DealType; label: string; short: string }[] = [
  { value: "website_build",            label: "Website Build",          short: "Web" },
  { value: "ai_automation",            label: "AI Automation",          short: "AI" },
  { value: "website_plus_automation",  label: "Website + Automation",   short: "Web + AI" },
  { value: "retainer",                 label: "Retainer",               short: "Retainer" },
  { value: "other",                    label: "Other",                  short: "Other" },
];

export const DEAL_TYPE_LABEL: Record<DealType, string> = Object.fromEntries(
  DEAL_TYPES.map((t) => [t.value, t.label])
) as Record<DealType, string>;

export const DEAL_TYPE_SHORT: Record<DealType, string> = Object.fromEntries(
  DEAL_TYPES.map((t) => [t.value, t.short])
) as Record<DealType, string>;

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "cold_outreach",  label: "Cold Outreach" },
  { value: "instagram_hb",   label: "Instagram / Hades Blueprint" },
  { value: "tiktok",         label: "TikTok" },
  { value: "referral",       label: "Referral" },
  { value: "network",        label: "Network" },
  { value: "website_form",   label: "Website Form" },
  { value: "other",          label: "Other" },
];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = Object.fromEntries(
  LEAD_SOURCES.map((s) => [s.value, s.label])
) as Record<LeadSource, string>;

export function dealEmphasis(deal: DealType): "one_time" | "mrr" | "both" {
  if (deal === "retainer") return "mrr";
  if (deal === "ai_automation") return "both";
  if (deal === "website_plus_automation") return "both";
  return "one_time";
}
