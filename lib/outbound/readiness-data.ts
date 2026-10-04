import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, Mailbox } from "@/lib/supabase/types";
import { emailDomain } from "./classify";
import { hostOf } from "./dns";
import { launchChecklist } from "./readiness";

/** Loads everything the launch checklist needs for one campaign. */
export async function loadChecklist(supabase: SupabaseClient, campaignId: string) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*, clients(website_url)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;
  const c = campaign as Campaign & { clients: { website_url: string | null } | null };

  const { data: links } = await supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", campaignId);
  const ids = ((links ?? []) as { mailbox_id: string }[]).map((l) => l.mailbox_id);
  const { data: boxes } = ids.length
    ? await supabase.from("mailboxes").select("*").in("id", ids)
    : { data: [] };
  const mailboxes = (boxes ?? []) as Mailbox[];

  const domains = Array.from(new Set(mailboxes.map((m) => emailDomain(m.email))));
  const { data: checks } = domains.length
    ? await supabase.from("domain_checks").select("domain, ok, checked_at").in("domain", domains)
    : { data: [] };

  const { count: openLeads } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "active"]);

  return launchChecklist({
    campaign: c,
    mailboxes,
    domains: (checks ?? []) as { domain: string; ok: boolean; checked_at: string }[],
    openLeads: openLeads ?? 0,
    clientDomain: hostOf(c.clients?.website_url),
  });
}
