import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AgentKind, AgentRun, Client } from "@/lib/supabase/types";
import { emptyUsage, type Usage } from "./claude";
import type { RunState } from "./pipelines";
import type { ResearchBrief } from "./schemas";

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function latestResearch(
  clientId: string
): Promise<{ id: string; brief: ResearchBrief } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("id, output")
    .eq("client_id", clientId)
    .eq("kind", "research" satisfies AgentKind)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<AgentRun, "id" | "output">>();
  const brief = (data?.output as RunState | null)?.brief;
  return data && brief ? { id: data.id, brief } : null;
}

export async function researchById(id: string): Promise<ResearchBrief | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("output")
    .eq("id", id)
    .maybeSingle<Pick<AgentRun, "output">>();
  return (data?.output as RunState | null)?.brief ?? null;
}

export async function getClientRow(id: string): Promise<Client | null> {
  const supabase = createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  return data ?? null;
}

export function mergeUsage(prev: Record<string, number> | null, add: Usage): Usage {
  const base = emptyUsage();
  for (const k of Object.keys(base) as (keyof Usage)[]) {
    base[k] = (prev?.[k] ?? 0) + add[k];
  }
  return base;
}
