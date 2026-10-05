-- =====================================================================
-- 0007: Outbound setup checks.
--
--   mailboxes.warmup_started_on / warmup_min_days   warmup tracking; the
--     sender won't use an inbox until it has warmed this many days
--   mailboxes.verified_at        last successful login test
--   campaigns.copy_approved_at / list_verified_at / test_sent_at
--                                launch checklist sign-offs
--   domain_checks                latest SPF / DKIM / DMARC / MX result
--
-- Run after 0006. Safe to re-run.
-- =====================================================================

alter table public.mailboxes add column if not exists warmup_started_on date;
alter table public.mailboxes add column if not exists warmup_min_days integer not null default 14;
alter table public.mailboxes add column if not exists verified_at timestamptz;

alter table public.campaigns add column if not exists copy_approved_at timestamptz;
alter table public.campaigns add column if not exists list_verified_at timestamptz;
alter table public.campaigns add column if not exists test_sent_at timestamptz;

create table if not exists public.domain_checks (
  domain text primary key,
  provider text not null,
  ok boolean not null,
  results jsonb not null,
  checked_at timestamptz not null default now()
);

alter table public.domain_checks enable row level security;

drop policy if exists "domain_checks: read authed"   on public.domain_checks;
drop policy if exists "domain_checks: insert authed" on public.domain_checks;
drop policy if exists "domain_checks: update authed" on public.domain_checks;
drop policy if exists "domain_checks: delete"        on public.domain_checks;

create policy "domain_checks: read authed"
  on public.domain_checks for select using (auth.role() = 'authenticated');
create policy "domain_checks: insert authed"
  on public.domain_checks for insert with check (auth.role() = 'authenticated');
create policy "domain_checks: update authed"
  on public.domain_checks for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "domain_checks: delete"
  on public.domain_checks for delete using (auth.role() = 'authenticated');
