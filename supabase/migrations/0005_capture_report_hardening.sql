-- =====================================================================
-- 0005 — Chrome capture, market report, run hardening.
-- Run after 0004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Run lock: only one advance at a time per run, even with two tabs open.
-- ---------------------------------------------------------------------
alter table public.agent_runs add column if not exists locked_until timestamptz;

-- ---------------------------------------------------------------------
-- intel_captures — screenshots + page text the local Chrome worker grabs
-- for each competitor (ad libraries, LinkedIn, website).
-- ---------------------------------------------------------------------
do $$ begin
  create type capture_source as enum (
    'meta_ads', 'linkedin_ads', 'google_ads', 'linkedin_page', 'website'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.intel_captures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  competitor text not null,
  source capture_source not null,
  url text not null,
  screenshot_path text,        -- path inside the private `intel` storage bucket
  page_text text,              -- visible text, trimmed
  ok boolean not null default true,
  error text,
  captured_at timestamptz not null default now()
);

create index if not exists intel_captures_client_idx
  on public.intel_captures(client_id, captured_at desc);

alter table public.intel_captures enable row level security;

drop policy if exists "intel: read authed"   on public.intel_captures;
drop policy if exists "intel: insert authed" on public.intel_captures;
drop policy if exists "intel: delete admin"  on public.intel_captures;

create policy "intel: read authed"
  on public.intel_captures for select
  using (auth.role() = 'authenticated');

create policy "intel: insert authed"
  on public.intel_captures for insert
  with check (auth.role() = 'authenticated');

create policy "intel: delete admin"
  on public.intel_captures for delete
  using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- Private storage bucket for screenshots (Supabase only).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('intel', 'intel', false)
    on conflict (id) do nothing;

    drop policy if exists "intel bucket: read authed" on storage.objects;
    create policy "intel bucket: read authed"
      on storage.objects for select
      using (bucket_id = 'intel' and auth.role() = 'authenticated');

    drop policy if exists "intel bucket: write authed" on storage.objects;
    create policy "intel bucket: write authed"
      on storage.objects for insert
      with check (bucket_id = 'intel' and auth.role() = 'authenticated');
  end if;
end $$;
