import { createClient } from "@/lib/supabase/server";
import type { AgentRun, Client } from "@/lib/supabase/types";

export type ClientWithStats = Client & {
  run_count: number;
  last_run_at: string | null;
};

export async function listClients(): Promise<ClientWithStats[]> {
  const supabase = createClient();
  const [{ data: clients }, { data: runs }] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase
      .from("agent_runs")
      .select("client_id, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const stats = new Map<string, { count: number; last: string }>();
  for (const r of (runs ?? []) as Pick<AgentRun, "client_id" | "created_at">[]) {
    const s = stats.get(r.client_id);
    if (s) s.count++;
    else stats.set(r.client_id, { count: 1, last: r.created_at });
  }

  return ((clients ?? []) as Client[]).map((c) => ({
    ...c,
    run_count: stats.get(c.id)?.count ?? 0,
    last_run_at: stats.get(c.id)?.last ?? null,
  }));
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  return data ?? null;
}

export async function listRuns(clientId: string): Promise<AgentRun[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as AgentRun[];
}
