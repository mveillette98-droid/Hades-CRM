"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/leads/actions";
import { clientSchema } from "./schema";

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function parse(formData: FormData) {
  const parsed = clientSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".");
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false as const, error: "Please fix the form errors.", fieldErrors };
  }
  return { ok: true as const, values: parsed.data };
}

export async function createClientProfile(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed;
  const { supabase, user } = await requireUser();

  const leadId = String(formData.get("lead_id") || "") || null;
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.values, lead_id: leadId, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create client." };

  if (leadId) {
    await supabase.from("activities").insert({
      lead_id: leadId,
      user_id: user.id,
      action: "lead.converted",
      details: { client_id: data.id, client: parsed.values.name },
    });
    revalidatePath(`/leads/${leadId}`);
  }

  revalidatePath("/clients");
  return { ok: true, data: { id: data.id } };
}

export async function updateClientProfile(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.ok) return parsed;
  const { supabase } = await requireUser();

  const { error } = await supabase.from("clients").update(parsed.values).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function deleteClientProfile(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clients");
  return { ok: true };
}

export async function setRunApproved(
  runId: string,
  clientId: string,
  approved: boolean
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("agent_runs").update({ approved }).eq("id", runId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Give up on a run that errored or stalled. */
export async function stopRun(runId: string, clientId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
