"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leadSchema } from "./schema";
import { DEAL_TYPE_LABEL, LEAD_SOURCE_LABEL } from "./labels";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function parseFormData(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = leadSchema.safeParse(raw);
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

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function logActivity(
  leadId: string,
  action: string,
  details?: Record<string, unknown>
) {
  const { supabase, user } = await requireUser();
  await supabase.from("activities").insert({
    lead_id: leadId,
    user_id: user.id,
    action,
    details: details ?? null,
  });
}

// -------------------- CREATE --------------------
export async function createLead(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return parsed;

  const { supabase, user } = await requireUser();
  const values = parsed.values;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      ...values,
      created_by: user.id,
      assigned_to: values.assigned_to ?? user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create lead." };
  }

  await logActivity(data.id, "lead.created", {
    company: values.company_name,
    deal_type: DEAL_TYPE_LABEL[values.deal_type],
    source: LEAD_SOURCE_LABEL[values.source],
    one_time_value: values.one_time_value,
    monthly_recurring_value: values.monthly_recurring_value,
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: data.id } };
}

// -------------------- UPDATE --------------------
export async function updateLead(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.ok) return parsed;

  const { supabase } = await requireUser();
  const values = parsed.values;

  // Pull previous row so we can diff for activity log
  const { data: before } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("leads").update(values).eq("id", id);

  if (error) return { ok: false, error: error.message };

  if (before) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      const next = values[key];
      const prev = (before as Record<string, unknown>)[key as string];
      if (String(prev ?? "") !== String(next ?? "")) {
        changes[key as string] = { from: prev, to: next };
      }
    }

    if (changes.stage_id) {
      await logActivity(id, "lead.stage_changed", {
        from: changes.stage_id.from,
        to: changes.stage_id.to,
      });
      delete changes.stage_id;
    }
    if (Object.keys(changes).length > 0) {
      await logActivity(id, "lead.updated", changes);
    }
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

// -------------------- MOVE STAGE --------------------
export async function changeLeadStage(
  id: string,
  stageId: string
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const { data: before } = await supabase
    .from("leads")
    .select("stage_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update({ stage_id: stageId })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await logActivity(id, "lead.stage_changed", {
    from: before?.stage_id,
    to: stageId,
  });

  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// -------------------- ADD NOTE --------------------
export async function addLeadNote(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const note = String(formData.get("note") || "").trim();
  if (!note) return { ok: false, error: "Note can't be empty." };
  await logActivity(id, "note.added", { note });
  revalidatePath(`/leads/${id}`);
  return { ok: true };
}

// -------------------- DELETE --------------------
export async function deleteLead(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

// -------------------- BULK: CHANGE STAGE --------------------
export async function bulkChangeStage(
  ids: string[],
  stageId: string
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  const { supabase } = await requireUser();

  const { data: before } = await supabase
    .from("leads")
    .select("id, stage_id")
    .in("id", ids);

  const { error } = await supabase
    .from("leads")
    .update({ stage_id: stageId })
    .in("id", ids);

  if (error) return { ok: false, error: error.message };

  const prevMap = new Map<string, string>();
  for (const row of (before ?? []) as { id: string; stage_id: string }[]) {
    prevMap.set(row.id, row.stage_id);
  }

  await Promise.all(
    ids.map((id) =>
      logActivity(id, "lead.stage_changed", {
        from: prevMap.get(id),
        to: stageId,
        bulk: true,
      })
    )
  );

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, data: { count: ids.length } };
}

// -------------------- BULK: REASSIGN --------------------
export async function bulkReassign(
  ids: string[],
  assigneeId: string
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("leads")
    .update({ assigned_to: assigneeId })
    .in("id", ids);

  if (error) return { ok: false, error: error.message };

  await Promise.all(
    ids.map((id) =>
      logActivity(id, "lead.reassigned", { to: assigneeId, bulk: true })
    )
  );

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, data: { count: ids.length } };
}

// -------------------- BULK: DELETE (admin) --------------------
export async function bulkDeleteLeads(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: "admin" | "member" }>();

  if (profile?.role !== "admin") {
    return { ok: false, error: "Only admins can bulk delete." };
  }

  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, data: { count: ids.length } };
}
