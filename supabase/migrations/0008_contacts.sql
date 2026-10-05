-- =====================================================================
-- 0008: Contacts.
--
-- One contact list per client: the people a client's campaigns go to.
-- Contacts come from a CSV, from Apollo, or by hand. Campaign leads now
-- point back at the contact they came from, so verification and history
-- follow the person.
--
-- Run after 0007. Safe to re-run.
-- =====================================================================

do $$ begin
  create type email_check as enum ('unverified', 'valid', 'risky', 'invalid', 'unknown');
exception when duplicate_object then null; end $$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text,                         -- null until Apollo reveals it
  first_name text,
  last_name text,
  title text,
  company text,
  company_domain text,
  linkedin_url text,
  city text,
  state text,
  country text,
  employees integer,
  industry text,
  personal_line text,
  fields jsonb not null default '{}'::jsonb,
  list_name text,                     -- e.g. "TX CAS owners, Oct"
  source text not null default 'csv', -- csv / apollo / manual
  apollo_id text,
  email_status email_check not null default 'unverified',
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_client_email_key
  on public.contacts(client_id, lower(email)) where email is not null;
create unique index if not exists contacts_client_apollo_key
  on public.contacts(client_id, apollo_id) where apollo_id is not null;
create index if not exists contacts_client_idx on public.contacts(client_id, created_at desc);

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();

alter table public.campaign_leads
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists campaign_leads_contact_idx on public.campaign_leads(contact_id);

alter table public.contacts enable row level security;

drop policy if exists "contacts: read authed"   on public.contacts;
drop policy if exists "contacts: insert authed" on public.contacts;
drop policy if exists "contacts: update authed" on public.contacts;
drop policy if exists "contacts: delete"        on public.contacts;

create policy "contacts: read authed"
  on public.contacts for select using (auth.role() = 'authenticated');
create policy "contacts: insert authed"
  on public.contacts for insert with check (auth.role() = 'authenticated');
create policy "contacts: update authed"
  on public.contacts for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "contacts: delete"
  on public.contacts for delete using (auth.role() = 'authenticated');
