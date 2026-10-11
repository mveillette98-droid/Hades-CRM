-- =====================================================================
-- 0009: Teardown funnel.
--
-- The public /teardown page is the Meta ads landing page. A firm owner
-- asks for a free competitor teardown, then books a call.
--
--   1. Leads remember where they came from (UTMs, fbclid).
--   2. Prospects get a `clients` row with status 'prospect', so the
--      research agent can run on them like any client.
--   3. Two functions the anonymous page is allowed to call. The page never
--      gets table access or the service role key:
--        submit_teardown(...)  creates the lead + prospect, returns lead id
--        teardown_booked(...)  moves the lead to Discovery Booked and
--                              queues the research run (the teardown)
--
-- The teardown only runs once a call is booked, so junk form fills don't
-- spend Claude credits. Run after 0008. Safe to re-run.
-- =====================================================================

alter type lead_source add value if not exists 'paid_ads';
alter type client_status add value if not exists 'prospect';

alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists utm_content text;
alter table public.leads add column if not exists utm_term text;
alter table public.leads add column if not exists fbclid text;
alter table public.leads add column if not exists booked_at timestamptz;

create index if not exists leads_utm_campaign_idx on public.leads(utm_campaign);

-- ---------------------------------------------------------------------
-- submit_teardown: the form. Validates, dedupes, creates lead + prospect.
-- ---------------------------------------------------------------------
create or replace function public.submit_teardown(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := left(btrim(coalesce(p->>'name', '')), 120);
  v_email   text := lower(left(btrim(coalesce(p->>'email', '')), 200));
  v_phone   text := nullif(left(btrim(coalesce(p->>'phone', '')), 40), '');
  v_firm    text := left(btrim(coalesce(p->>'firm', '')), 160);
  v_website text := left(btrim(coalesce(p->>'website', '')), 300);
  v_role    text := nullif(left(btrim(coalesce(p->>'role', '')), 60), '');
  v_size    text := nullif(left(btrim(coalesce(p->>'size', '')), 40), '');
  v_problem text := nullif(left(btrim(coalesce(p->>'problem', '')), 1000), '');
  v_stage   uuid;
  v_lead    uuid;
  v_notes   text;
begin
  if v_name = '' or v_firm = '' or v_website = '' then
    raise exception 'missing_fields';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bad_email';
  end if;
  if v_website !~* '^https?://' then
    v_website := 'https://' || v_website;
  end if;

  -- Same person submitting twice in a day: hand back the lead we already have.
  select id into v_lead
  from public.leads
  where lower(email) = v_email and source = 'paid_ads' and created_at > now() - interval '1 day'
  order by created_at desc
  limit 1;
  if v_lead is not null then
    return jsonb_build_object('lead_id', v_lead, 'duplicate', true);
  end if;

  select id into v_stage
  from public.pipeline_stages
  where not is_won and not is_lost
  order by position
  limit 1;

  v_notes := concat_ws(E'\n',
    'Teardown request from the ads page.',
    'Role: ' || v_role,
    'Firm size: ' || v_size,
    'Biggest growth problem: ' || v_problem);

  insert into public.leads (
    contact_name, company_name, phone, email, website_url, vertical,
    deal_type, stage_id, source, scope_notes,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid
  ) values (
    v_name, v_firm, v_phone, v_email, v_website, 'Accounting / CAS',
    'outbound_retainer', v_stage, 'paid_ads', v_notes,
    nullif(left(p->>'utm_source', 200), ''),
    nullif(left(p->>'utm_medium', 200), ''),
    nullif(left(p->>'utm_campaign', 200), ''),
    nullif(left(p->>'utm_content', 200), ''),
    nullif(left(p->>'utm_term', 200), ''),
    nullif(left(p->>'fbclid', 500), '')
  )
  returning id into v_lead;

  insert into public.clients (name, vertical, website_url, company_size, status, notes, lead_id)
  values (v_firm, 'Accounting / CAS', v_website, v_size, 'prospect', v_notes, v_lead);

  insert into public.activities (lead_id, action, details)
  values (v_lead, 'lead.created', jsonb_build_object(
    'company', v_firm, 'source', 'paid_ads', 'via', 'teardown page'));

  return jsonb_build_object('lead_id', v_lead, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- teardown_booked: the calendar said "booked". Move the lead and queue
-- the research run. Idempotent: a second call does nothing.
-- ---------------------------------------------------------------------
create or replace function public.teardown_booked(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   public.leads%rowtype;
  v_client uuid;
  v_stage  uuid;
  v_run    uuid;
begin
  select * into v_lead from public.leads where id = p_lead and source = 'paid_ads';
  if not found then
    raise exception 'not_found';
  end if;
  if v_lead.booked_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select id into v_stage
  from public.pipeline_stages
  where not is_won and not is_lost
  order by position
  offset 1
  limit 1;

  update public.leads
  set booked_at = now(), stage_id = coalesce(v_stage, stage_id)
  where id = p_lead;

  if v_stage is not null and v_stage <> v_lead.stage_id then
    insert into public.activities (lead_id, action, details)
    values (p_lead, 'lead.stage_changed', jsonb_build_object(
      'from', v_lead.stage_id, 'to', v_stage, 'via', 'teardown page'));
  end if;

  select id into v_client from public.clients where lead_id = p_lead order by created_at limit 1;
  if v_client is not null and not exists (
    select 1 from public.agent_runs where client_id = v_client and kind = 'research'
  ) then
    insert into public.agent_runs (client_id, kind, status, step, instructions, output)
    values (
      v_client, 'research', 'running', 'Queued: waiting for the agent worker',
      'This firm has NOT signed. It is a prospect who asked for a free competitor teardown from a Meta ad and booked a sales call. Research them and their competitors the same way, so the strategist can walk them through it on the call. Use only what is public; the form answers are in the notes.',
      jsonb_build_object('phase', 'profile', 'dives', '[]'::jsonb, 'wait_for_capture', false)
    )
    returning id into v_run;
  end if;

  return jsonb_build_object('ok', true, 'run_id', v_run);
end;
$$;

revoke all on function public.submit_teardown(jsonb) from public;
revoke all on function public.teardown_booked(uuid) from public;
grant execute on function public.submit_teardown(jsonb) to anon, authenticated;
grant execute on function public.teardown_booked(uuid) to anon, authenticated;
