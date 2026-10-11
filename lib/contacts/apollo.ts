/**
 * Apollo.io connector. Optional: needs APOLLO_API_KEY in .env.local.
 *
 * Search is free on Apollo's side and returns people without emails (or
 * with a locked placeholder). Getting the email ("enrich") spends Apollo
 * credits, so it only runs on the people you choose to save.
 */

const BASE = "https://api.apollo.io/api/v1";

export interface ApolloFilters {
  titles: string[];
  locations: string[];
  employeeRanges: string[]; // "11,20", "21,50" …
  keywords: string[];       // company keyword tags, e.g. "accounting", "cpa"
  page: number;
  perPage: number;          // ≤ 100
}

export interface ContactDraft {
  apollo_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employees: number | null;
  industry: string | null;
}

export const EMPLOYEE_RANGES = [
  { value: "1,10", label: "1 to 10" },
  { value: "11,20", label: "11 to 20" },
  { value: "21,50", label: "21 to 50" },
  { value: "51,100", label: "51 to 100" },
  { value: "101,200", label: "101 to 200" },
];

type Fetch = typeof fetch;

export class ApolloError extends Error {}

export function apolloConfigured(): boolean {
  return !!process.env.APOLLO_API_KEY?.trim();
}

async function call<T>(path: string, body: unknown, f: Fetch = fetch): Promise<T> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) throw new ApolloError("Add APOLLO_API_KEY to .env.local to search Apollo.");
  let res: Response;
  try {
    res = await f(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ApolloError(`Couldn't reach Apollo: ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApolloError("Apollo refused the API key. Check it, and that your plan includes API access.");
  }
  if (res.status === 422) throw new ApolloError("Apollo didn't accept those filters. Loosen them and try again.");
  if (res.status === 429) throw new ApolloError("Apollo's rate limit hit. Wait a minute and try again.");
  if (!res.ok) throw new ApolloError(`Apollo answered ${res.status}.`);
  return (await res.json()) as T;
}

/** Apollo hides emails it hasn't unlocked behind a placeholder. */
export function realEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e.includes("@") || e.includes("not_unlocked") || e.endsWith("@domain.com")) return null;
  return e;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function toDraft(p: Record<string, any>): ContactDraft {
  const org = (p.organization ?? p.account ?? {}) as Record<string, any>;
  const domain = s(org.primary_domain) ?? s(org.website_url)?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") ?? null;
  const n = Number(org.estimated_num_employees);
  return {
    apollo_id: s(p.id),
    email: realEmail(p.email),
    first_name: s(p.first_name),
    last_name: s(p.last_name) ?? s(p.last_name_obfuscated),
    title: s(p.title),
    company: s(org.name) ?? s(p.organization_name),
    company_domain: domain,
    linkedin_url: s(p.linkedin_url),
    city: s(p.city),
    state: s(p.state),
    country: s(p.country),
    employees: Number.isFinite(n) && n > 0 ? n : null,
    industry: s(org.industry),
  };
}

export async function searchPeople(
  filters: ApolloFilters,
  f?: Fetch
): Promise<{ people: ContactDraft[]; total: number; page: number; totalPages: number }> {
  const body: Record<string, unknown> = {
    page: Math.max(1, filters.page),
    per_page: Math.min(100, Math.max(1, filters.perPage)),
  };
  if (filters.titles.length) body.person_titles = filters.titles;
  if (filters.locations.length) body.person_locations = filters.locations;
  if (filters.employeeRanges.length) body.organization_num_employees_ranges = filters.employeeRanges;
  if (filters.keywords.length) body.q_organization_keyword_tags = filters.keywords;

  const data = await call<{ people?: any[]; contacts?: any[]; pagination?: { total_entries?: number; page?: number; total_pages?: number } }>(
    "/mixed_people/search",
    body,
    f
  );
  const people = [...(data.people ?? []), ...(data.contacts ?? [])].map(toDraft).filter((p) => p.apollo_id);
  return {
    people,
    total: data.pagination?.total_entries ?? people.length,
    page: data.pagination?.page ?? filters.page,
    totalPages: data.pagination?.total_pages ?? 1,
  };
}

/** Reveal work emails for up to 10 people per call (spends Apollo credits). */
export async function enrichPeople(ids: string[], f?: Fetch): Promise<Map<string, ContactDraft>> {
  const out = new Map<string, ContactDraft>();
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const data = await call<{ matches?: (Record<string, any> | null)[] }>(
      "/people/bulk_match",
      { details: chunk.map((id) => ({ id })), reveal_personal_emails: false },
      f
    );
    for (const m of data.matches ?? []) {
      if (!m) continue;
      const d = toDraft(m);
      if (d.apollo_id) out.set(d.apollo_id, d);
    }
  }
  return out;
}
