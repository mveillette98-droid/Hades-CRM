import type { CampaignStatus, OutboundLeadStatus } from "@/lib/supabase/types";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Sending",
  paused: "Paused",
  completed: "Finished",
};

export const LEAD_STATUS_LABEL: Record<OutboundLeadStatus, string> = {
  queued: "Queued",
  active: "In sequence",
  completed: "Finished",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  failed: "Failed",
  paused: "Paused",
};

export const REPLY_LABELS = [
  { value: "interested", label: "Interested" },
  { value: "booked", label: "Call booked" },
  { value: "later", label: "Not now" },
  { value: "referral", label: "Referral" },
  { value: "not_interested", label: "Not interested" },
] as const;

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Halifax",
  "Europe/London",
  "Australia/Sydney",
];
