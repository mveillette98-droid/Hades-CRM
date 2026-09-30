import type { AgentKind, ClientStatus } from "@/lib/supabase/types";

export const CLIENT_STATUSES: { value: ClientStatus; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active",     label: "Active" },
  { value: "paused",     label: "Paused" },
  { value: "churned",    label: "Churned" },
];

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = Object.fromEntries(
  CLIENT_STATUSES.map((s) => [s.value, s.label])
) as Record<ClientStatus, string>;

export const AGENT_LABEL: Record<AgentKind, string> = {
  research: "Onboarding research",
  cold_email: "Cold email campaign",
  content: "LinkedIn content",
};

/** The brief fields, in the order the form and agents use them. */
export const BRIEF_FIELDS = [
  {
    key: "offer",
    label: "Offer",
    hint: "What they sell and to whom. e.g. Monthly CAS + fractional CFO for $2M to $20M construction firms.",
  },
  {
    key: "icp",
    label: "Ideal client",
    hint: "Who they want more of: industry, size, revenue, geography, the title who signs.",
  },
  {
    key: "pain_points",
    label: "Pain points",
    hint: "What their best clients were struggling with before they signed. Their words, not ours.",
  },
  {
    key: "differentiators",
    label: "Differentiators",
    hint: "Why them over the firm down the street. Niche focus, speed, tech stack, pricing model.",
  },
  {
    key: "proof",
    label: "Proof",
    hint: "Case studies, numbers with timeframes, testimonials. Agents will only claim what's here.",
  },
  {
    key: "voice",
    label: "Voice",
    hint: "How they talk. Formal, blunt, warm? Paste a line from the owner if you have one.",
  },
  {
    key: "avoid",
    label: "Avoid",
    hint: "Words, claims, competitors, or angles that are off limits.",
  },
] as const;
