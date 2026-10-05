-- =====================================================================
-- 0006: Outbound: Cadence's own cold email sender.
--
--   mailboxes          sending inboxes (Google Workspace / any SMTP+IMAP)
--   mailbox_secrets    app passwords, AES-GCM encrypted by the app
--   campaigns          one sequence for one client, steps + send window
--   campaign_mailboxes which inboxes a campaign rotates through
--   campaign_leads     prospects and where each one is in the sequence
--   email_messages     every email sent and every reply / bounce received
--   suppressions       never email these addresses or domains again
--   outbound_worker    heartbeat from the local sender (`npm run sender`)
--
-- Run after 0005. Safe to re-run.
-- =====================================================================

do $$ begin
  create type mailbox_status as enum ('active', 'paused', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_status as enum ('draft', 'active', 'paused', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outbound_lead_status as enum (
    'queued', 'active', 'completed', 'replied', 'bounced', 'unsubscribed', 'failed', 'paused'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- mailboxes
-- ---------------------------------------------------------------------
create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  email text not null,
  from_name text not null,
  username text not null,
  smtp_host text not null,
  smtp_port integer not null default 465,
  imap_host text,
  imap_port integer not null default 993,
  signature text,
  daily_limit integer not null default 30 check (daily_limit between 1 and 500),
  min_gap_seconds integer not null default 300 check (min_gap_seconds >= 30),
  status mailbox_status not null default 'active',
  last_error text,
  last_sent_at timestamptz,
  imap_uid_validity bigint,
  imap_last_uid bigint,
  last_checked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mailboxes_email_key on public.mailboxes (lower(email));

drop trigger if exists mailboxes_touch_updated_at on public.mailboxes;
create trigger mailboxes_touch_updated_at
  before update on public.mailboxes
  for each row execute function public.touch_updated_at();

create table if not exists public.mailbox_secrets (
  mailbox_id uuid primary key references public.mailboxes(id) on delete cascade,
  password_enc text not null,   -- iv.tag.ciphertext, key lives in CADENCE_SECRET_KEY
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_run_id uuid references public.agent_runs(id) on delete set null,
  name text not null,
  status campaign_status not null default 'draft',
  timezone text not null default 'America/New_York',
  window_start smallint not null default 8  check (window_start between 0 and 23),
  window_end   smallint not null default 17 check (window_end between 1 and 24),
  send_days smallint[] not null default '{1,2,3,4,5}',   -- 1 = Monday … 7 = Sunday
  thread_followups boolean not null default true,
  footer text,
  -- [{ "step": 1, "day": 1, "subject": "...", "body": "..." }, ...]
  steps jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_client_idx on public.campaigns(client_id, created_at desc);

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_updated_at();

create table if not exists public.campaign_mailboxes (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  primary key (campaign_id, mailbox_id)
);

-- ---------------------------------------------------------------------
-- campaign_leads
-- ---------------------------------------------------------------------
create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  personal_line text,
  fields jsonb not null default '{}'::jsonb,
  status outbound_lead_status not null default 'queued',
  current_step integer not null default 0,     -- how many steps have gone out
  next_send_at timestamptz not null default now(),
  mailbox_id uuid references public.mailboxes(id) on delete set null,  -- sticky per thread
  thread_subject text,
  last_message_id text,
  message_ids text[] not null default '{}',
  attempts integer not null default 0,
  last_error text,
  reply_label text,                             -- interested / not_interested / later / referral
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaign_leads_email_key
  on public.campaign_leads(campaign_id, lower(email));
create index if not exists campaign_leads_due_idx
  on public.campaign_leads(campaign_id, status, next_send_at);
create index if not exists campaign_leads_email_idx
  on public.campaign_leads(lower(email));

drop trigger if exists campaign_leads_touch_updated_at on public.campaign_leads;
create trigger campaign_leads_touch_updated_at
  before update on public.campaign_leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- email_messages
-- ---------------------------------------------------------------------
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.campaign_leads(id) on delete set null,
  mailbox_id uuid references public.mailboxes(id) on delete set null,
  direction email_direction not null,
  kind text not null,            -- sent / reply / auto_reply / bounce / unsubscribe
  step integer,
  message_id text,
  in_reply_to text,
  from_email text,
  to_email text,
  subject text,
  body_text text,
  handled boolean not null default false,   -- inbound: operator has looked at it
  sent_at timestamptz not null default now()
);

create index if not exists email_messages_mailbox_idx
  on public.email_messages(mailbox_id, direction, sent_at desc);
create index if not exists email_messages_campaign_idx
  on public.email_messages(campaign_id, sent_at desc);
create index if not exists email_messages_message_id_idx
  on public.email_messages(message_id);

-- ---------------------------------------------------------------------
-- suppressions
-- ---------------------------------------------------------------------
create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,          -- bounced / unsubscribed / manual
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);

create unique index if not exists suppressions_email_key
  on public.suppressions(lower(email)) where email is not null;
create unique index if not exists suppressions_domain_key
  on public.suppressions(lower(domain)) where domain is not null;

-- ---------------------------------------------------------------------
-- outbound_worker: the local sender writes a heartbeat every tick
-- ---------------------------------------------------------------------
create table if not exists public.outbound_worker (
  id text primary key,
  last_tick_at timestamptz not null default now(),
  info jsonb
);

-- ---------------------------------------------------------------------
-- RLS: internal team tool. Signed-in teammates work on everything,
-- only admins delete mailboxes and campaigns.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'mailboxes', 'mailbox_secrets', 'campaigns', 'campaign_mailboxes',
    'campaign_leads', 'email_messages', 'suppressions', 'outbound_worker'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s: read authed" on public.%I', t, t);
    execute format('drop policy if exists "%s: insert authed" on public.%I', t, t);
    execute format('drop policy if exists "%s: update authed" on public.%I', t, t);
    execute format('drop policy if exists "%s: delete" on public.%I', t, t);

    execute format(
      'create policy "%s: read authed" on public.%I for select using (auth.role() = ''authenticated'')', t, t);
    execute format(
      'create policy "%s: insert authed" on public.%I for insert with check (auth.role() = ''authenticated'')', t, t);
    execute format(
      'create policy "%s: update authed" on public.%I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t, t);

    if t in ('mailboxes', 'campaigns') then
      execute format(
        'create policy "%s: delete" on public.%I for delete using (public.is_admin(auth.uid()))', t, t);
    else
      execute format(
        'create policy "%s: delete" on public.%I for delete using (auth.role() = ''authenticated'')', t, t);
    end if;
  end loop;
end $$;
