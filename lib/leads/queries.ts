import { createClient } from "@/lib/supabase/server";
import type {
  Activity,
  AgentRun,
  Lead,
  PipelineStage,
  Profile,
} from "@/lib/supabase/types";

export type LeadWithJoins = Lead & {
  stage: Pick<PipelineStage, "id" | "name" | "position" | "is_won" | "is_lost"> | null;
  assignee: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export async function listStages(): Promise<PipelineStage[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position", { ascending: true });
  return (data ?? []) as PipelineStage[];
}

export async function listTeam(): Promise<Pick<Profile, "id" | "full_name" | "email" | "role">[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name", { ascending: true });
  return (data ?? []) as Pick<Profile, "id" | "full_name" | "email" | "role">[];
}

export async function listLeads(): Promise<LeadWithJoins[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      `*,
       stage:pipeline_stages ( id, name, position, is_won, is_lost ),
       assignee:profiles!leads_assigned_to_fkey ( id, full_name, email )`
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as LeadWithJoins[];
}

export async function getLead(id: string): Promise<LeadWithJoins | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      `*,
       stage:pipeline_stages ( id, name, position, is_won, is_lost ),
       assignee:profiles!leads_assigned_to_fkey ( id, full_name, email )`
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as LeadWithJoins) ?? null;
}

export type ActivityWithUser = Activity & {
  user: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export async function listActivities(leadId: string): Promise<ActivityWithUser[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("activities")
    .select(
      `*,
       user:profiles ( id, full_name, email )`
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as ActivityWithUser[];
}

export type RecentActivity = Activity & {
  user: Pick<Profile, "id" | "full_name" | "email"> | null;
  lead: Pick<Lead, "id" | "company_name" | "contact_name"> | null;
};

export async function listRecentActivity(
  limit = 15
): Promise<RecentActivity[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("activities")
    .select(
      `*,
       user:profiles ( id, full_name, email ),
       lead:leads ( id, company_name, contact_name )`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as RecentActivity[];
}

export async function currentRole(): Promise<"admin" | "member" | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: "admin" | "member" }>();
  return data?.role ?? "member";
}

export interface LeadTeardown {
  clientId: string;
  run: Pick<AgentRun, "id" | "status" | "step" | "error"> | null;
}

/** The prospect profile an ads lead got, and its teardown (research run), if any. */
export async function getTeardown(leadId: string): Promise<LeadTeardown | null> {
  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!client) return null;

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, status, step, error")
    .eq("client_id", client.id)
    .eq("kind", "research")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<AgentRun, "id" | "status" | "step" | "error">>();
  return { clientId: client.id, run: run ?? null };
}
