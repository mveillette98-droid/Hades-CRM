-- =====================================================================
-- Hades Blueprint CRM — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- =====================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_type as enum (
    'website_build',
    'ai_automation',
    'website_plus_automation',
    'retainer',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum (
    'cold_outreach',
    'instagram_hb',
    'tiktok',
    'referral',
    'network',
    'website_form',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles — extends auth.users with role + display info
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- pipeline_stages — customizable columns for the kanban
-- ---------------------------------------------------------------------
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists pipeline_stages_position_unique
  on public.pipeline_stages(position);

-- Seed default stages
insert into public.pipeline_stages (name, position, is_won, is_lost)
values
  ('New Lead',              1, false, false),
  ('Discovery Call Booked', 2, false, false),
  ('Discovery Completed',   3, false, false),
  ('Proposal Sent',         4, false, false),
  ('Negotiation',           5, false, false),
  ('Contract Signed',       6, false, false),
  ('In Delivery',           7, false, false),
  ('Delivered/Won',         8, true,  false),
  ('Lost',                  9, false, true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- leads — the heart of the CRM
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  contact_name text not null,
  company_name text not null,
  phone text,
  email text,
  website_url text,

  deal_type deal_type not null default 'website_build',
  one_time_value numeric(12, 2) not null default 0,
  monthly_recurring_value numeric(12, 2) not null default 0,
  total_contract_value numeric(12, 2)
    generated always as (one_time_value + (monthly_recurring_value * 12)) stored,

  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  source lead_source not null default 'cold_outreach',
  scope_notes text,

  assigned_to uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  next_followup_date  date,
  proposal_sent_date  date,
  expected_close_date date,
  actual_close_date   date
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
create index if not exists leads_stage_id_idx    on public.leads(stage_id);
create index if not exists leads_source_idx      on public.leads(source);
create index if not exists leads_created_at_idx  on public.leads(created_at desc);
create index if not exists leads_close_date_idx  on public.leads(expected_close_date);

-- ---------------------------------------------------------------------
-- activities — append-only event log per lead
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activities_lead_id_idx on public.activities(lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — admins see everything, members see only their assigned leads
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads           enable row level security;
alter table public.activities      enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = uid and p.role = 'admin'
  );
$$;

-- profiles
drop policy if exists "profiles: self or admin read"     on public.profiles;
drop policy if exists "profiles: self update"            on public.profiles;
drop policy if exists "profiles: admin manage"           on public.profiles;

create policy "profiles: self or admin read"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles: admin manage"
  on public.profiles for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- pipeline_stages — readable by any authed user, writable by admins only
drop policy if exists "stages: read authed"   on public.pipeline_stages;
drop policy if exists "stages: admin manage"  on public.pipeline_stages;

create policy "stages: read authed"
  on public.pipeline_stages for select
  using (auth.role() = 'authenticated');

create policy "stages: admin manage"
  on public.pipeline_stages for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- leads — admins see all; members see their assigned + unassigned-created-by-them
drop policy if exists "leads: read scoped"    on public.leads;
drop policy if exists "leads: insert authed"  on public.leads;
drop policy if exists "leads: update scoped"  on public.leads;
drop policy if exists "leads: delete admin"   on public.leads;

create policy "leads: read scoped"
  on public.leads for select
  using (
    public.is_admin(auth.uid())
    or assigned_to = auth.uid()
    or created_by  = auth.uid()
  );

create policy "leads: insert authed"
  on public.leads for insert
  with check (auth.role() = 'authenticated');

create policy "leads: update scoped"
  on public.leads for update
  using (
    public.is_admin(auth.uid())
    or assigned_to = auth.uid()
  )
  with check (
    public.is_admin(auth.uid())
    or assigned_to = auth.uid()
  );

create policy "leads: delete admin"
  on public.leads for delete
  using (public.is_admin(auth.uid()));

-- activities — read if you can read the lead; insert your own only
drop policy if exists "activities: read via lead"  on public.activities;
drop policy if exists "activities: insert self"    on public.activities;

create policy "activities: read via lead"
  on public.activities for select
  using (
    exists (
      select 1 from public.leads l
      where l.id = activities.lead_id
        and (
          public.is_admin(auth.uid())
          or l.assigned_to = auth.uid()
          or l.created_by  = auth.uid()
        )
    )
  );

create policy "activities: insert self"
  on public.activities for insert
  with check (user_id = auth.uid() or user_id is null);
