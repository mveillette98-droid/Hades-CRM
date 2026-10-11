-- =====================================================================
-- 0003 — Cadence GTM
--
-- Turns the Hades Blueprint CRM into the Cadence GTM operator console:
--   1. Re-labels deal types, lead sources and pipeline stages for a
--      GTM growth firm (existing rows are renamed in place, no data loss).
--   2. Adds `vertical` to leads so we can see which niche each deal is in.
--   3. Adds the fulfillment engine: `clients` (one profile per retained
--      firm) and `agent_runs` (every research / email / content run the
--      agents produce for a client).
--
-- Run after 0001 and 0002. Safe to run once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. deal_type → Cadence offers
-- ---------------------------------------------------------------------
do $$ begin
  alter type deal_type rename value 'website_build' to 'gtm_setup';
exception when invalid_parameter_value or duplicate_object then null; end $$;

do $$ begin
  alter type deal_type rename value 'ai_automation' to 'outbound_retainer';
exception when invalid_parameter_value or duplicate_object then null; end $$;

do $$ begin
  alter type deal_type rename value 'website_plus_automation' to 'full_gtm';
exception when invalid_parameter_value or duplicate_object then null; end $$;

do $$ begin
  alter type deal_type rename value 'retainer' to 'content_retainer';
exception when invalid_parameter_value or duplicate_object then null; end $$;

alter type deal_type add value if not exists 'paid_ads';

alter table public.leads alter column deal_type set default 'outbound_retainer';

-- ---------------------------------------------------------------------
-- 1b. lead_source → Cadence acquisition channels
-- ---------------------------------------------------------------------
do $$ begin
  alter type lead_source rename value 'cold_outreach' to 'cold_email';
exception when invalid_parameter_value or duplicate_object then null; end $$;

do $$ begin
  alter type lead_source rename value 'instagram_hb' to 'instagram';
exception when invalid_parameter_value or duplicate_object then null; end $$;

alter type lead_source add value if not exists 'cold_call';
alter type lead_source add value if not exists 'linkedin';

alter table public.leads alter column source set default 'cold_email';

-- ---------------------------------------------------------------------
-- 1c. pipeline stages → a growth-firm sales cycle
-- Only renames the untouched defaults; custom stage names are left alone.
-- ---------------------------------------------------------------------
update public.pipeline_stages set name = 'Discovery Booked' where name = 'Discovery Call Booked' and position = 2;
update public.pipeline_stages set name = 'Discovery Done'   where name = 'Discovery Completed'   and position = 3;
update public.pipeline_stages set name = 'Signed'           where name = 'Contract Signed'       and position = 6;
update public.pipeline_stages set name = 'Onboarding'       where name = 'In Delivery'           and position = 7;
update public.pipeline_stages set name = 'Live Client'      where name = 'Delivered/Won'         and position = 8;

-- ---------------------------------------------------------------------
-- 2. leads.vertical
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists vertical text;
create index if not exists leads_vertical_idx on public.leads(vertical);

-- ---------------------------------------------------------------------
-- 3a. clients — the profile every agent reads from
-- ---------------------------------------------------------------------
do $$ begin
  create type client_status as enum ('onboarding', 'active', 'paused', 'churned');
exception when duplicate_object then null; end $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  vertical text not null default 'Accounting / CAS',
  website_url text,
  status client_status not null default 'onboarding',
  monthly_retainer numeric(12, 2) not null default 0,

  -- The brief. Every agent reads these fields.
  offer text,              -- what the client sells and to whom
  icp text,                -- who they want more of
  pain_points text,        -- what keeps that ICP up at night
  differentiators text,    -- why them over the firm down the street
  proof text,              -- case studies, numbers, testimonials
  voice text,              -- how they talk
  avoid text,              -- words, claims, or angles that are off limits
  notes text,

  lead_id uuid references public.leads(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists clients_touch_updated_at on public.clients;
create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.touch_updated_at();

create index if not exists clients_status_idx on public.clients(status);
create index if not exists clients_created_at_idx on public.clients(created_at desc);

-- ---------------------------------------------------------------------
-- 3b. agent_runs — every output the agent team produces
-- ---------------------------------------------------------------------
do $$ begin
  create type agent_kind as enum ('research', 'cold_email', 'content');
exception when duplicate_object then null; end $$;

do $$ begin
  create type agent_run_status as enum ('running', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind agent_kind not null,
  status agent_run_status not null default 'running',
  step text,                 -- human-readable progress ("Critic round 2")
  instructions text,         -- optional operator steer for this run
  output jsonb,              -- structured result
  error text,
  model text,
  usage jsonb,               -- summed token usage across every call in the run
  approved boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_runs_client_idx on public.agent_runs(client_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — internal team tool: any signed-in teammate works on clients,
-- only admins delete.
-- ---------------------------------------------------------------------
alter table public.clients    enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "clients: read authed"   on public.clients;
drop policy if exists "clients: insert authed" on public.clients;
drop policy if exists "clients: update authed" on public.clients;
drop policy if exists "clients: delete admin"  on public.clients;

create policy "clients: read authed"
  on public.clients for select
  using (auth.role() = 'authenticated');

create policy "clients: insert authed"
  on public.clients for insert
  with check (auth.role() = 'authenticated');

create policy "clients: update authed"
  on public.clients for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "clients: delete admin"
  on public.clients for delete
  using (public.is_admin(auth.uid()));

drop policy if exists "agent_runs: read authed"   on public.agent_runs;
drop policy if exists "agent_runs: insert authed" on public.agent_runs;
drop policy if exists "agent_runs: update authed" on public.agent_runs;
drop policy if exists "agent_runs: delete admin"  on public.agent_runs;

create policy "agent_runs: read authed"
  on public.agent_runs for select
  using (auth.role() = 'authenticated');

create policy "agent_runs: insert authed"
  on public.agent_runs for insert
  with check (auth.role() = 'authenticated');

create policy "agent_runs: update authed"
  on public.agent_runs for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "agent_runs: delete admin"
  on public.agent_runs for delete
  using (public.is_admin(auth.uid()));
