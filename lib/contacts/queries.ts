import { createClient } from "@/lib/supabase/server";
import type { Contact, ContactEmailStatus } from "@/lib/supabase/types";
import type { RunState } from "@/lib/agents/pipelines";

export interface ContactFilters {
  list?: string;
  status?: ContactEmailStatus | "no_email";
  q?: string;
}

export async function listContacts(clientId: string, f: ContactFilters = {}): Promise<Contact[]> {
  const supabase = createClient();
  let q = supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (f.list) q = q.eq("list_name", f.list);
  if (f.status === "no_email") q = q.is("email", null);
  else if (f.status) q = q.eq("email_status", f.status);
  if (f.q?.trim()) {
    const term = f.q.trim().replace(/[%,()"]/g, " ");
    q = q.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%,title.ilike.%${term}%`);
  }
  const { data } = await q;
  return (data ?? []) as Contact[];
}

export async function contactStats(clientId: string) {
  const supabase = createClient();
  const count = async (fn: (q: any) => any) => {
    const { count } = await fn(
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("client_id", clientId)
    );
    return (count as number | null) ?? 0;
  };
  const [total, withEmail, valid, invalid] = await Promise.all([
    count((q) => q),
    count((q) => q.not("email", "is", null)),
    count((q) => q.eq("email_status", "valid")),
    count((q) => q.eq("email_status", "invalid")),
  ]);
  return { total, withEmail, valid, invalid };
}

export async function listNames(clientId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("contacts")
    .select("list_name")
    .eq("client_id", clientId)
    .not("list_name", "is", null)
    .limit(5000);
  return Array.from(new Set(((data ?? []) as { list_name: string }[]).map((r) => r.list_name))).sort();
}

/** Which of these contacts are already in a campaign, and which one. */
export async function campaignsFor(contactIds: string[]): Promise<Map<string, string>> {
  const supabase = createClient();
  const out = new Map<string, string>();
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await supabase
      .from("campaign_leads")
      .select("contact_id, campaigns(name)")
      .in("contact_id", contactIds.slice(i, i + 200));
    for (const r of (data ?? []) as unknown as { contact_id: string; campaigns: { name: string } | null }[]) {
      out.set(r.contact_id, r.campaigns?.name ?? "a campaign");
    }
  }
  return out;
}

/** Starting filters for an Apollo search, from the client's research and brief. */
export async function apolloDefaults(clientId: string) {
  const supabase = createClient();
  const [{ data: client }, { data: run }] = await Promise.all([
    supabase.from("clients").select("location").eq("id", clientId).maybeSingle<{ location: string | null }>(),
    supabase
      .from("agent_runs")
      .select("output")
      .eq("client_id", clientId)
      .eq("kind", "research")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ output: RunState | null }>(),
  ]);
  const titles = run?.output?.brief?.icp?.buyer_titles ?? [];
  return {
    titles: titles.slice(0, 6),
    locations: client?.location ? [client.location.split(/[;\n]/)[0].trim()].filter(Boolean) : ["United States"],
    fromResearch: titles.length > 0,
  };
}
