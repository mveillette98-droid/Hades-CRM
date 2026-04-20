/**
 * Minimal hand-written types mirroring the SQL migration.
 * Replace with `supabase gen types typescript` output once the project is live.
 */

export type UserRole = "admin" | "member";

export type DealType =
  | "website_build"
  | "ai_automation"
  | "website_plus_automation"
  | "retainer"
  | "other";

export type LeadSource =
  | "cold_outreach"
  | "instagram_hb"
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      deal_type: DealType;
      lead_source: LeadSource;
    };
  };
}
