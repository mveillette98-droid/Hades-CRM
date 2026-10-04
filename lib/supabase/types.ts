/**
 * Minimal hand-written types mirroring the SQL migration.
 * Replace with `supabase gen types typescript` output once the project is live.
 */

export type UserRole = "admin" | "member";

export type DealType =
  | "outbound_retainer"
  | "gtm_setup"
  | "content_retainer"
  | "paid_ads"
  | "full_gtm"
  | "other";

export type LeadSource =
  | "cold_call"
  | "cold_email"
  | "linkedin"
  | "instagram"
  | "tiktok"
  | "referral"
  | "network"
  | "website_form"
  | "other";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  contact_name: string;
  company_name: string;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  vertical: string | null;
  deal_type: DealType;
  one_time_value: number;
  monthly_recurring_value: number;
  total_contract_value: number; // generated column
  stage_id: string;
  source: LeadSource;
  scope_notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stage_entered_at: string;
  next_followup_date: string | null;
  proposal_sent_date: string | null;
  expected_close_date: string | null;
  actual_close_date: string | null;
}

export type ClientStatus = "onboarding" | "active" | "paused" | "churned";

export interface Client {
  id: string;
  name: string;
  vertical: string;
  website_url: string | null;
  company_size: string | null;
  location: string | null;
  known_competitors: string | null;
  current_marketing: string | null;
  status: ClientStatus;
  monthly_retainer: number;
  offer: string | null;
  icp: string | null;
  pain_points: string | null;
  differentiators: string | null;
  proof: string | null;
  voice: string | null;
  avoid: string | null;
  notes: string | null;
  lead_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentKind = "research" | "cold_email" | "content";
export type AgentRunStatus = "running" | "succeeded" | "failed";

export interface AgentRun {
  id: string;
  client_id: string;
  kind: AgentKind;
  status: AgentRunStatus;
  step: string | null;
  instructions: string | null;
  output: Record<string, unknown> | null;
  error: string | null;
  model: string | null;
  usage: Record<string, number> | null;
  approved: boolean;
  locked_until: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export type CaptureSource = "meta_ads" | "linkedin_ads" | "google_ads" | "linkedin_page" | "website";

export interface IntelCapture {
  id: string;
  client_id: string;
  run_id: string | null;
  competitor: string;
  source: CaptureSource;
  url: string;
  screenshot_path: string | null;
  page_text: string | null;
  ok: boolean;
  error: string | null;
  captured_at: string;
}

export type MailboxStatus = "active" | "paused" | "error";

export interface Mailbox {
  id: string;
  client_id: string | null;
  email: string;
  from_name: string;
  username: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string | null;
  imap_port: number;
  signature: string | null;
  daily_limit: number;
  min_gap_seconds: number;
  status: MailboxStatus;
  last_error: string | null;
  warmup_started_on: string | null;
  warmup_min_days: number;
  verified_at: string | null;
  last_sent_at: string | null;
  imap_uid_validity: number | null;
  imap_last_uid: number | null;
  last_checked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface CampaignStep {
  step: number;
  day: number;
  subject: string;
  body: string;
}

export interface Campaign {
  id: string;
  client_id: string;
  source_run_id: string | null;
  name: string;
  status: CampaignStatus;
  timezone: string;
  window_start: number;
  window_end: number;
  send_days: number[];
  thread_followups: boolean;
  footer: string | null;
  steps: CampaignStep[];
  copy_approved_at: string | null;
  list_verified_at: string | null;
  test_sent_at: string | null;
  started_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OutboundLeadStatus =
  | "queued"
  | "active"
  | "completed"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "failed"
  | "paused";

export interface CampaignLead {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  personal_line: string | null;
  fields: Record<string, string>;
  status: OutboundLeadStatus;
  current_step: number;
  next_send_at: string;
  mailbox_id: string | null;
  thread_subject: string | null;
  last_message_id: string | null;
  message_ids: string[];
  attempts: number;
  last_error: string | null;
  reply_label: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainCheckRow {
  domain: string;
  provider: string;
  ok: boolean;
  results: import("@/lib/outbound/dns").DomainReport;
  checked_at: string;
}

export type ContactEmailStatus = "unverified" | "valid" | "risky" | "invalid" | "unknown";

export interface Contact {
  id: string;
  client_id: string;
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
  personal_line: string | null;
  fields: Record<string, string>;
  list_name: string | null;
  source: "csv" | "apollo" | "manual";
  apollo_id: string | null;
  email_status: ContactEmailStatus;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailKind = "sent" | "reply" | "auto_reply" | "unsubscribe" | "bounce";

export interface EmailMessage {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  mailbox_id: string | null;
  direction: "outbound" | "inbound";
  kind: EmailKind;
  step: number | null;
  message_id: string | null;
  in_reply_to: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  handled: boolean;
  sent_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Shape expected by @supabase/supabase-js generics.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      pipeline_stages: {
        Row: PipelineStage;
        Insert: {
          id?: string;
          name: string;
          position: number;
          is_won?: boolean;
          is_lost?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          position?: number;
          is_won?: boolean;
          is_lost?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: {
          id?: string;
          contact_name: string;
          company_name: string;
          phone?: string | null;
          email?: string | null;
          website_url?: string | null;
          vertical?: string | null;
          deal_type?: DealType;
          one_time_value?: number;
          monthly_recurring_value?: number;
          stage_id: string;
          source?: LeadSource;
          scope_notes?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          next_followup_date?: string | null;
          proposal_sent_date?: string | null;
          expected_close_date?: string | null;
          actual_close_date?: string | null;
        };
        Update: Partial<Lead>;
        Relationships: [];
      };
      activities: {
        Row: Activity;
        Insert: {
          id?: string;
          lead_id: string;
          user_id?: string | null;
          action: string;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<Activity>;
        Relationships: [];
      };
      clients: {
        Row: Client;
        Insert: Partial<Omit<Client, "id" | "created_at" | "updated_at">> & {
          name: string;
        };
        Update: Partial<Client>;
        Relationships: [];
      };
      agent_runs: {
        Row: AgentRun;
        Insert: Partial<Omit<AgentRun, "id" | "created_at">> & {
          client_id: string;
          kind: AgentKind;
        };
        Update: Partial<AgentRun>;
        Relationships: [];
      };
      intel_captures: {
        Row: IntelCapture;
        Insert: Partial<Omit<IntelCapture, "id" | "captured_at">> & {
          client_id: string;
          competitor: string;
          source: CaptureSource;
          url: string;
        };
        Update: Partial<IntelCapture>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      deal_type: DealType;
      lead_source: LeadSource;
      client_status: ClientStatus;
      agent_kind: AgentKind;
      agent_run_status: AgentRunStatus;
      capture_source: CaptureSource;
    };
  };
}
