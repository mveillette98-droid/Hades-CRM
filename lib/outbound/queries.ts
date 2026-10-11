import { createClient } from "@/lib/supabase/server";
import type {
  DomainCheckRow,
  Campaign,
  CampaignLead,
  EmailMessage,
  Mailbox,
  OutboundLeadStatus,
} from "@/lib/supabase/types";

export type MailboxWithStats = Mailbox & { sent_24h: number; client_name: string | null };

export async function listMailboxes(): Promise<MailboxWithStats[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mailboxes")
    .select("*, clients(name)")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as (Mailbox & { clients: { name: string } | null })[];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return Promise.all(
    rows.map(async ({ clients, ...m }) => {
      const { count } = await supabase
        .from("email_messages")
        .select("id", { count: "exact", head: true })
        .eq("mailbox_id", m.id)
        .eq("kind", "sent")
        .gte("sent_at", since);
      return { ...m, sent_24h: count ?? 0, client_name: clients?.name ?? null };
    })
  );
}

export async function senderHeartbeat(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("outbound_worker")
    .select("last_tick_at")
    .eq("id", "sender")
    .maybeSingle<{ last_tick_at: string }>();
  return data?.last_tick_at ?? null;
}

export interface CampaignStats {
  leads: number;
  contacted: number;
  replied: number;
  bounced: number;
  sent: number;
}

async function campaignStats(id: string): Promise<CampaignStats> {
  const supabase = createClient();
  const count = async (filter: (q: any) => any, table = "campaign_leads") => {
    const { count } = await filter(
      supabase.from(table).select("id", { count: "exact", head: true }).eq("campaign_id", id)
    );
    return (count as number | null) ?? 0;
  };
  const [leads, contacted, replied, bounced, sent] = await Promise.all([
    count((q) => q),
    count((q) => q.gt("current_step", 0)),
    count((q) => q.eq("status", "replied")),
    count((q) => q.eq("status", "bounced")),
    count((q) => q.eq("kind", "sent"), "email_messages"),
  ]);
  return { leads, contacted, replied, bounced, sent };
}

export type CampaignWithStats = Campaign & { client_name: string; stats: CampaignStats };

export async function listCampaigns(clientId?: string): Promise<CampaignWithStats[]> {
  const supabase = createClient();
  let q = supabase.from("campaigns").select("*, clients(name)").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  const rows = (data ?? []) as (Campaign & { clients: { name: string } | null })[];
  return Promise.all(
    rows.map(async ({ clients, ...c }) => ({
      ...c,
      client_name: clients?.name ?? "Unknown client",
      stats: await campaignStats(c.id),
    }))
  );
}

export async function getCampaign(id: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*, clients(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { clients, ...campaign } = data as Campaign & { clients: { id: string; name: string } };
  const [{ data: links }, stats, statusCounts] = await Promise.all([
    supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id),
    campaignStats(id),
    leadStatusCounts(id),
  ]);
  return {
    campaign,
    client: clients,
    mailboxIds: ((links ?? []) as { mailbox_id: string }[]).map((l) => l.mailbox_id),
    stats,
    statusCounts,
  };
}

const STATUSES: OutboundLeadStatus[] = [
  "queued",
  "active",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
  "paused",
];

async function leadStatusCounts(id: string): Promise<Record<OutboundLeadStatus, number>> {
  const supabase = createClient();
  const entries = await Promise.all(
    STATUSES.map(async (s) => {
      const { count } = await supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", s);
      return [s, count ?? 0] as const;
    })
  );
  return Object.fromEntries(entries) as Record<OutboundLeadStatus, number>;
}

export async function listLeads(
  campaignId: string,
  status?: OutboundLeadStatus
): Promise<CampaignLead[]> {
  const supabase = createClient();
  let q = supabase
    .from("campaign_leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as CampaignLead[];
}

export type InboundMessage = EmailMessage & {
  campaign_leads: Pick<CampaignLead, "first_name" | "last_name" | "company" | "email" | "reply_label"> | null;
  campaigns: { name: string; client_id: string } | null;
};

export async function listInbound(opts: { campaignId?: string; unhandledOnly?: boolean } = {}) {
  const supabase = createClient();
  let q = supabase
    .from("email_messages")
    .select("*, campaign_leads(first_name, last_name, company, email, reply_label), campaigns(name, client_id)")
    .eq("direction", "inbound")
    .in("kind", ["reply", "unsubscribe"])
    .order("sent_at", { ascending: false })
    .limit(100);
  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  if (opts.unhandledOnly) q = q.eq("handled", false);
  const { data } = await q;
  return (data ?? []) as InboundMessage[];
}

/** The emails we sent a lead, oldest first (for the reply view). */
export async function threadFor(leadId: string): Promise<EmailMessage[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("email_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });
  return (data ?? []) as EmailMessage[];
}

export async function listDomainChecks(): Promise<DomainCheckRow[]> {
  const supabase = createClient();
  const { data } = await supabase.from("domain_checks").select("*");
  return (data ?? []) as DomainCheckRow[];
}
