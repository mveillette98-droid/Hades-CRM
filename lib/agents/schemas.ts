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

// ---------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------
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
  sources: { title: string; url: string }[];
}

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
  competitors: list("3 to 5 alternatives the prospect is weighing, including doing nothing.", {
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
  sources: list("Sources you actually used.", {
    title: str("Page title."),
    url: str("URL."),
  }),
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
