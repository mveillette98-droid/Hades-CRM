-- =====================================================================
-- 0004 — onboarding intake fields the research agents start from.
-- Run after 0003.
-- =====================================================================

alter table public.clients add column if not exists company_size      text; -- headcount, revenue band
alter table public.clients add column if not exists location          text; -- HQ + markets served
alter table public.clients add column if not exists known_competitors text; -- names or URLs the client gave us
alter table public.clients add column if not exists current_marketing text; -- what they run today, what's worked
