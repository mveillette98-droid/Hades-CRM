-- =====================================================================
-- 0002 — track how long a lead has been in its current stage.
-- Run after 0001_initial_schema.sql.
-- =====================================================================

alter table public.leads
  add column if not exists stage_entered_at timestamptz not null default now();

-- Backfill for existing rows: assume they entered their current stage when
-- the row was last updated.
update public.leads
set stage_entered_at = coalesce(updated_at, created_at)
where stage_entered_at > coalesce(updated_at, created_at);

-- Trigger: any time stage_id changes, stamp stage_entered_at = now()
create or replace function public.touch_stage_entered_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_touch_stage_entered_at on public.leads;
create trigger leads_touch_stage_entered_at
  before update on public.leads
  for each row execute function public.touch_stage_entered_at();

create index if not exists leads_stage_entered_at_idx
  on public.leads(stage_entered_at desc);
