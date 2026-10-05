"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/leads/actions";
import type { Contact } from "@/lib/supabase/types";
import { emailDomain } from "@/lib/outbound/classify";
import { parseLeads } from "@/lib/outbound/csv";
import {
  ApolloError,
  enrichPeople,
  searchPeople,
  type ApolloFilters,
  type ContactDraft,
} from "./apollo";
import { verifyMany } from "./verify";

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const clean = (v: string | null | undefined, max = 300) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

// ---------------------------------------------------------------------
// Apollo
// ---------------------------------------------------------------------
export interface ApolloSearchResult {
  people: (ContactDraft & { saved: boolean })[];
  total: number;
  page: number;
  totalPages: number;
}

export async function searchApollo(
  clientId: string,
  filters: ApolloFilters
): Promise<ActionResult<ApolloSearchResult>> {
  const { supabase } = await requireUser();
  if (!filters.titles.length && !filters.keywords.length) {
    return { ok: false, error: "Add at least one job title or company keyword." };
  }
  try {
    const res = await searchPeople(filters);
    const ids = res.people.map((p) => p.apollo_id!).filter(Boolean);
    const saved = new Set<string>();
    for (const part of chunk(ids, 200)) {
      const { data } = await supabase.from("contacts").select("apollo_id").eq("client_id", clientId).in("apollo_id", part);
      for (const r of (data ?? []) as { apollo_id: string }[]) saved.add(r.apollo_id);
    }
    return {
      ok: true,
      data: { ...res, people: res.people.map((p) => ({ ...p, saved: saved.has(p.apollo_id!) })) },
    };
  } catch (e) {
    return { ok: false, error: e instanceof ApolloError ? e.message : `Apollo search failed: ${(e as Error).message}` };
  }
}

export interface SaveSummary {
  added: number;
  withEmail: number;
  duplicates: number;
}

/** Save picked Apollo people. With `reveal`, unlock their work emails first (spends credits). */
export async function saveApolloContacts(
  clientId: string,
  people: ContactDraft[],
  opts: { reveal: boolean; listName: string }
): Promise<ActionResult<SaveSummary>> {
  const { supabase, user } = await requireUser();
  if (people.length === 0) return { ok: false, error: "Pick at least one person." };
  if (people.length > 100) return { ok: false, error: "Save 100 or fewer at a time." };

  // Keep only contact columns: the search rows also carry UI flags like `saved`.
  let drafts: ContactDraft[] = people.map((p) => ({
    apollo_id: p.apollo_id,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    title: p.title,
    company: p.company,
    company_domain: p.company_domain,
    linkedin_url: p.linkedin_url,
    city: p.city,
    state: p.state,
    country: p.country,
    employees: p.employees,
    industry: p.industry,
  }));
  if (opts.reveal) {
    const need = drafts.filter((p) => !p.email && p.apollo_id).map((p) => p.apollo_id!);
    try {
      const found = need.length ? await enrichPeople(need) : new Map<string, ContactDraft>();
      drafts = drafts.map((p) => {
        const f = p.apollo_id ? found.get(p.apollo_id) : undefined;
        return f ? { ...p, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null)) } : p;
      });
    } catch (e) {
      return { ok: false, error: e instanceof ApolloError ? e.message : (e as Error).message };
    }
  }

  return insertContacts(supabase, user.id, clientId, drafts.map((d) => ({ ...d, source: "apollo" as const })), opts.listName);
}

type NewContact = Partial<Omit<Contact, "id" | "client_id" | "created_at" | "updated_at">> & {
  source: "csv" | "apollo" | "manual";
};

async function insertContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  clientId: string,
  rows: NewContact[],
  listName: string
): Promise<ActionResult<SaveSummary>> {
  // Skip anyone already on this client's list, by email or Apollo id.
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const apolloIds = rows.map((r) => r.apollo_id).filter((e): e is string => !!e);
  const haveEmail = new Set<string>();
  const haveApollo = new Set<string>();
  for (const part of chunk(emails, 200)) {
    const { data } = await supabase.from("contacts").select("email").eq("client_id", clientId).in("email", part);
    for (const r of (data ?? []) as { email: string }[]) haveEmail.add(r.email.toLowerCase());
  }
  for (const part of chunk(apolloIds, 200)) {
    const { data } = await supabase.from("contacts").select("apollo_id").eq("client_id", clientId).in("apollo_id", part);
    for (const r of (data ?? []) as { apollo_id: string }[]) haveApollo.add(r.apollo_id);
  }

  const seen = new Set<string>();
  const fresh = rows.filter((r) => {
    const key = r.email ?? r.apollo_id ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (r.email && haveEmail.has(r.email)) return false;
    if (r.apollo_id && haveApollo.has(r.apollo_id)) return false;
    return true;
  });

  const list = clean(listName, 80);
  let added = 0;
  for (const part of chunk(fresh, 500)) {
    const { error } = await supabase.from("contacts").insert(
      part.map((r) => ({
        ...r,
        client_id: clientId,
        list_name: list,
        email: r.email?.toLowerCase() ?? null,
        email_status: "unverified",
        created_by: userId,
      }))
    );
    if (error) return { ok: false, error: `Saved ${added} before an error: ${error.message}` };
    added += part.length;
  }

  revalidatePath(`/clients/${clientId}/contacts`);
  return {
    ok: true,
    data: { added, withEmail: fresh.filter((r) => r.email).length, duplicates: rows.length - fresh.length },
  };
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------
const pick = (fields: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = fields[k];
    if (v) {
      delete fields[k];
      return v;
    }
  }
  return null;
};

export async function importContactsCsv(
  clientId: string,
  csv: string,
  listName: string
): Promise<ActionResult<SaveSummary & { invalid: number }>> {
  const parsed = parseLeads(csv);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (parsed.leads.length > 10_000) return { ok: false, error: "Import 10,000 or fewer at a time." };
  const { supabase, user } = await requireUser();

  const rows: NewContact[] = parsed.leads.map((l) => {
    const f = { ...l.fields };
    const employees = Number((pick(f, "employees", "employee_count", "number_of_employees", "company_size") ?? "").replace(/[^0-9]/g, ""));
    return {
      source: "csv",
      email: l.email,
      first_name: l.first_name,
      last_name: l.last_name,
      title: l.title,
      company: l.company,
      personal_line: l.personal_line,
      company_domain: pick(f, "website", "company_website", "domain", "company_domain"),
      linkedin_url: pick(f, "linkedin", "linkedin_url", "person_linkedin_url", "linkedin_profile"),
      city: pick(f, "city"),
      state: pick(f, "state", "region"),
      country: pick(f, "country"),
      industry: pick(f, "industry"),
      employees: Number.isFinite(employees) && employees > 0 ? employees : null,
      fields: f,
    };
  });
  const res = await insertContacts(supabase, user.id, clientId, rows, listName);
  if (!res.ok) return res;
  return { ok: true, data: { ...res.data!, invalid: parsed.invalid } };
}

// ---------------------------------------------------------------------
// Verify, delete
// ---------------------------------------------------------------------
export async function verifyContacts(
  clientId: string,
  contactIds: string[]
): Promise<ActionResult<{ checked: number; valid: number; risky: number; invalid: number; unknown: number }>> {
  const { supabase } = await requireUser();
  if (contactIds.length === 0) return { ok: false, error: "Pick contacts to verify." };
  if (contactIds.length > 300) return { ok: false, error: "Verify 300 or fewer at a time." };

  const rows: { id: string; email: string | null }[] = [];
  for (const part of chunk(contactIds, 200)) {
    const { data } = await supabase.from("contacts").select("id, email").eq("client_id", clientId).in("id", part);
    rows.push(...((data ?? []) as { id: string; email: string | null }[]));
  }
  const withEmail = rows.filter((r): r is { id: string; email: string } => !!r.email);
  if (withEmail.length === 0) return { ok: false, error: "None of those have an email yet." };

  const { results, error } = await verifyMany(withEmail.map((r) => r.email));
  const tally = { checked: 0, valid: 0, risky: 0, invalid: 0, unknown: 0 };
  const now = new Date().toISOString();
  for (const status of ["valid", "risky", "invalid", "unknown"] as const) {
    const ids = withEmail.filter((r) => results.get(r.email) === status).map((r) => r.id);
    tally[status] = ids.length;
    tally.checked += ids.length;
    for (const part of chunk(ids, 200)) {
      await supabase.from("contacts").update({ email_status: status, verified_at: now }).in("id", part);
    }
  }
  revalidatePath(`/clients/${clientId}/contacts`);
  if (error && tally.checked === 0) return { ok: false, error };
  return { ok: true, data: tally };
}

export async function deleteContacts(clientId: string, contactIds: string[]): Promise<ActionResult> {
  const { supabase } = await requireUser();
  for (const part of chunk(contactIds, 200)) {
    const { error } = await supabase.from("contacts").delete().eq("client_id", clientId).in("id", part);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(`/clients/${clientId}/contacts`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Into a campaign
// ---------------------------------------------------------------------
export interface AddSummary {
  added: number;
  noEmail: number;
  badEmail: number;
  alreadyContacted: number;
  suppressed: number;
}

export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[],
  opts: { includeRisky: boolean }
): Promise<ActionResult<AddSummary>> {
  const { supabase } = await requireUser();
  if (contactIds.length === 0) return { ok: false, error: "Pick contacts first." };
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, client_id")
    .eq("id", campaignId)
    .maybeSingle<{ id: string; client_id: string }>();
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const contacts: Contact[] = [];
  for (const part of chunk(contactIds, 200)) {
    const { data } = await supabase.from("contacts").select("*").eq("client_id", campaign.client_id).in("id", part);
    contacts.push(...((data ?? []) as Contact[]));
  }

  const summary: AddSummary = { added: 0, noEmail: 0, badEmail: 0, alreadyContacted: 0, suppressed: 0 };
  const okStatus = new Set(opts.includeRisky ? ["valid", "risky", "unverified", "unknown"] : ["valid", "unverified", "unknown"]);
  const usable = contacts.filter((c) => {
    if (!c.email) return summary.noEmail++, false;
    if (!okStatus.has(c.email_status)) return summary.badEmail++, false;
    return true;
  });

  // Same rules as CSV import: never twice for one client, never the do-not-email list.
  const { data: siblings } = await supabase.from("campaigns").select("id").eq("client_id", campaign.client_id);
  const campaignIds = ((siblings ?? []) as { id: string }[]).map((c) => c.id);
  const emails = usable.map((c) => c.email!.toLowerCase());
  const taken = new Set<string>();
  const blocked = new Set<string>();
  for (const part of chunk(emails, 200)) {
    const [{ data: existing }, { data: sup }] = await Promise.all([
      supabase.from("campaign_leads").select("email").in("campaign_id", campaignIds).in("email", part),
      supabase.from("suppressions").select("email").in("email", part),
    ]);
    for (const r of (existing ?? []) as { email: string }[]) taken.add(r.email.toLowerCase());
    for (const r of (sup ?? []) as { email: string }[]) blocked.add(r.email.toLowerCase());
  }
  const domains = Array.from(new Set(emails.map(emailDomain)));
  for (const part of chunk(domains, 200)) {
    const { data } = await supabase.from("suppressions").select("domain").in("domain", part);
    for (const r of (data ?? []) as { domain: string }[]) blocked.add(`@${r.domain.toLowerCase()}`);
  }

  const rows = [];
  for (const c of usable) {
    const email = c.email!.toLowerCase();
    if (blocked.has(email) || blocked.has(`@${emailDomain(email)}`)) {
      summary.suppressed++;
      continue;
    }
    if (taken.has(email)) {
      summary.alreadyContacted++;
      continue;
    }
    taken.add(email);
    const extra: Record<string, string> = { ...(c.fields ?? {}) };
    if (c.city) extra.city = c.city;
    if (c.state) extra.state = c.state;
    if (c.industry) extra.industry = c.industry;
    if (c.company_domain) extra.company_domain = c.company_domain;
    if (c.linkedin_url) extra.linkedin_url = c.linkedin_url;
    if (c.employees) extra.employees = String(c.employees);
    rows.push({
      campaign_id: campaignId,
      contact_id: c.id,
      email,
      first_name: c.first_name,
      last_name: c.last_name,
      company: c.company,
      title: c.title,
      personal_line: c.personal_line,
      fields: extra,
    });
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from("campaign_leads").insert(part);
    if (error) return { ok: false, error: `Added ${summary.added} before an error: ${error.message}` };
    summary.added += part.length;
  }

  revalidatePath(`/outbound/${campaignId}`);
  revalidatePath(`/clients/${campaign.client_id}/contacts`);
  return { ok: true, data: summary };
}
