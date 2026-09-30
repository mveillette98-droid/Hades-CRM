/**
 * Output contracts for every agent. Each JSON schema is used as a strict
 * tool schema, so every field is required and no extras are allowed.
 * The matching TS types are what the UI renders.
 */

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: "string", description });
const strList = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: { type: "string" },
});
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (description: string, properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "array",
  description,
  items: obj(properties),
});

const sources = list("Sources you actually used.", {
  title: str("Page title."),
  url: str("URL."),
});

// ---------------------------------------------------------------------
// Onboarding research, step 1: the client itself
// ---------------------------------------------------------------------
export interface CompanyProfile {
  summary: string;
  niche: string;
  services: string[];
  size_estimate: string;
  locations: string;
  positioning: string;
  current_marketing: { channel: string; observation: string; confidence: Confidence }[];
  strengths: string[];
  weaknesses: string[];
  sources: { title: string; url: string }[];
}

export type Confidence = "observed" | "inferred";
const confidence: JsonSchema = {
  type: "string",
  enum: ["observed", "inferred"],
  description: "observed = you saw it in a source. inferred = your read from indirect signals.",
};

export const companyProfileSchema: JsonSchema = obj({
  summary: str("3 to 4 sentences: who this firm is, who it serves, and how it makes money."),
  niche: str("The specific niche(s) they serve, as narrow as the evidence supports."),
  services: strList("Services they sell, most important first."),
  size_estimate: str("Headcount and revenue band, with how you estimated it."),
  locations: str("HQ and markets they serve."),
  positioning: str("How they pitch themselves today, in one or two sentences."),
  current_marketing: list("Every marketing channel you can find them using.", {
    channel: str("Channel, e.g. LinkedIn organic, Google Ads, newsletter, webinars, referrals."),
    observation: str("What they do there and how active they are."),
    confidence,
  }),
  strengths: strList("What they have going for them in a sales conversation."),
  weaknesses: strList("Gaps in their positioning, proof, or marketing we need to fix or work around."),
  sources,
});

// ---------------------------------------------------------------------
// Step 2: pick the 3 competitors worth studying
// ---------------------------------------------------------------------
export interface CompetitorPick {
  name: string;
  website: string;
  why: string;
  size_estimate: string;
}

export interface CompetitorList {
  competitors: CompetitorPick[];
}

export const competitorListSchema: JsonSchema = obj({
  competitors: list("Exactly 3 competitors, the ones whose marketing is most worth copying first.", {
    name: str("Firm name."),
    website: str("Homepage URL."),
    why: str("Why this one: same buyer, visibly winning, and how you know."),
    size_estimate: str("Rough headcount or revenue band."),
  }),
});

// ---------------------------------------------------------------------
// Step 3: channel deep dive, one competitor at a time
// ---------------------------------------------------------------------
export const CHANNELS = [
  "meta_ads",
  "linkedin_organic",
  "linkedin_ads",
  "google_ads",
  "seo_content",
  "cold_outbound",
  "email_newsletter",
  "events_webinars",
  "partnerships_referrals",
  "reviews_directories",
] as const;
export type Channel = (typeof CHANNELS)[number];

export type ActivityLevel = "heavy" | "moderate" | "light" | "none_found" | "unknown";

export interface CompetitorDive {
  name: string;
  website: string;
  positioning: string;
  offer_and_pricing: string;
  channels: {
    channel: Channel;
    activity: ActivityLevel;
    what_they_do: string;
    evidence: string;
    confidence: Confidence;
  }[];
  whats_working: string[];
  weaknesses: string[];
  sources: { title: string; url: string }[];
}

export const competitorDiveSchema: JsonSchema = obj({
  name: str("Competitor name."),
  website: str("Homepage URL."),
  positioning: str("Their pitch, headline promise, and who they say they're for."),
  offer_and_pricing: str("Packages, lead magnets, free offers, and pricing if public. Say 'not public' if not."),
  channels: list("One entry for every channel in the enum, even if you found nothing.", {
    channel: { type: "string", enum: [...CHANNELS], description: "Channel." },
    activity: {
      type: "string",
      enum: ["heavy", "moderate", "light", "none_found", "unknown"],
      description: "unknown = you couldn't check (e.g. the source needs a login). none_found = you checked and found nothing.",
    },
    what_they_do: str("Specifics: ad hooks and formats, post themes and cadence, outbound tells, keywords, offers."),
    evidence: str("What you saw and where, or what signal you inferred from."),
    confidence,
  }),
  whats_working: strList("What is visibly working for them and why you think so."),
  weaknesses: strList("Where they're weak or absent that our client can exploit."),
  sources,
});

// ---------------------------------------------------------------------
// Step 4: synthesis. The research brief the writers use, plus the playbook
// ---------------------------------------------------------------------
export interface Playbook {
  summary: string;
  replicate: { what: string; from_competitor: string; channel: string; how_we_adapt: string }[];
  gaps_to_exploit: string[];
  channel_plan: { channel: string; priority: number; why: string; first_actions: string[] }[];
  first_30_days: string[];
}

export interface ResearchBrief {
  market_summary: string;
  icp: {
    firmographics: string;
    buyer_titles: string[];
    buying_triggers: string[];
  };
  pain_points: { pain: string; evidence: string }[];
  objections: { objection: string; response: string }[];
  competitors: { name: string; positioning: string; gap: string }[];
  angles: { name: string; hook: string; why_it_works: string; proof_needed: string }[];
  playbook?: Playbook;
  sources: { title: string; url: string }[];
}

const playbookSchema: JsonSchema = obj({
  summary: str("The strategy in 3 sentences: what we copy, what we do differently, where we start."),
  replicate: list("Specific plays that are working for competitors and that we should run for this client.", {
    what: str("The play, specifically (e.g. 'LinkedIn carousel breaking down a real client's cash flow fix, posted twice a week')."),
    from_competitor: str("Which competitor it comes from."),
    channel: str("Channel."),
    how_we_adapt: str("How we make it ours using this client's proof, niche, and voice."),
  }),
  gaps_to_exploit: strList("Channels, angles, or buyer segments competitors are ignoring."),
  channel_plan: list("Channels ranked by priority for this client.", {
    channel: str("Channel."),
    priority: { type: "integer", description: "1 = start now, 2 = next 60 days, 3 = later or skip." },
    why: str("Why this priority, tied to the evidence."),
    first_actions: strList("The first 2 or 3 concrete actions."),
  }),
  first_30_days: strList("Week by week, what we ship in the first 30 days."),
});

export const researchSchema: JsonSchema = obj({
  market_summary: str("3 to 5 sentences on the market this client sells into, what's changing, and where the money is."),
  icp: obj({
    firmographics: str("Who the ideal buyer is: industry, size, revenue band, geography."),
    buyer_titles: strList("Job titles of the people who sign or influence the deal."),
    buying_triggers: strList("Events that make a prospect ready to buy now (new funding, hiring a controller, tax deadline, etc)."),
  }),
  pain_points: list("5 to 8 pains, ranked most urgent first.", {
    pain: str("The pain in the buyer's own words."),
    evidence: str("Where this shows up: a source, a pattern, or the client's brief."),
  }),
  objections: list("The 3 to 5 objections a prospect will raise.", {
    objection: str("The objection as the prospect would say it."),
    response: str("How to handle it in one or two sentences."),
  }),
  competitors: list("The competitors studied, including doing nothing if relevant.", {
    name: str("Competitor or alternative."),
    positioning: str("How they pitch themselves."),
    gap: str("Where they fall short that this client can exploit."),
  }),
  angles: list("3 to 5 outbound angles, strongest first.", {
    name: str("Short label for the angle."),
    hook: str("One-line opener that would stop this buyer."),
    why_it_works: str("Why this buyer cares, tied to a pain or trigger."),
    proof_needed: str("What proof makes it believable, and whether the client has it."),
  }),
  playbook: playbookSchema,
  sources,
});

// ---------------------------------------------------------------------
// Cold email
// ---------------------------------------------------------------------
export interface EmailCampaign {
  sequences: {
    angle: string;
    audience: string;
    emails: { step: number; send_day: number; subject: string; body: string }[];
  }[];
  personalization_notes: string;
}

export const emailCampaignSchema: JsonSchema = obj({
  sequences: list("One sequence per angle you were given.", {
    angle: str("Which research angle this sequence runs."),
    audience: str("Who exactly gets it (title plus firm type)."),
    emails: list("3 or 4 emails.", {
      step: { type: "integer", description: "1-based step number." },
      send_day: { type: "integer", description: "Day the email goes out, counting the first email as day 1." },
      subject: str("Subject line. Short, lowercase, reads like a colleague sent it."),
      body: str("Plain-text body. Use {{first_name}} and {{company}} merge tags. Sign off as {{sender_name}}."),
    }),
  }),
  personalization_notes: str("How to fill the first line per prospect, and which data points to pull when building the list."),
});

// ---------------------------------------------------------------------
// LinkedIn content
// ---------------------------------------------------------------------
export interface ContentPack {
  posts: {
    angle: string;
    format: string;
    hook: string;
    body: string;
    cta: string;
  }[];
}

export const contentPackSchema: JsonSchema = obj({
  posts: list("The posts, in suggested publishing order.", {
    angle: str("Which research angle or pain the post runs on."),
    format: {
      type: "string",
      enum: ["story", "list", "contrarian", "case_study", "how_to"],
      description: "Post format.",
    },
    hook: str("First line. Has to earn the 'see more' click."),
    body: str("The rest of the post, line breaks included."),
    cta: str("Soft call to action at the end."),
  }),
});

// ---------------------------------------------------------------------
// Critic
// ---------------------------------------------------------------------
export interface Critique {
  score: number;
  verdict: "ship" | "revise";
  summary: string;
  issues: { location: string; problem: string; fix: string }[];
}

export const critiqueSchema: JsonSchema = obj({
  score: { type: "integer", description: "Overall score from 1 to 10. 8 or higher means a client could see it today." },
  verdict: { type: "string", enum: ["ship", "revise"], description: "ship if score is 8 or higher, otherwise revise." },
  summary: str("Two sentences: what works, and the biggest thing holding it back."),
  issues: list("Every problem worth fixing, worst first. Empty if nothing.", {
    location: str("Where: e.g. 'Sequence 2, email 1, subject' or 'Post 3 hook'."),
    problem: str("What's wrong, specifically."),
    fix: str("Exactly how to fix it."),
  }),
});
