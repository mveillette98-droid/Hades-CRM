# Cadence GTM

Operator console for Cadence GTM, a growth firm that books qualified sales calls for professional services firms (starting with accounting / CAS).

Two halves in one app:

- **Sell**: pipeline, leads, sources, dashboard. Tracks your own deals from first dial to signed.
- **Deliver**: client briefs plus an agent team that does the fulfillment work. Research feeds the writers, and every draft goes through a critic before you see it.

---

## The agent team

Each client gets one brief (offer, ICP, pains, differentiators, proof, voice, off-limits). Every agent reads it.

| Agent | What it does | Tools |
| --- | --- | --- |
| **Onboarding research** | 6 steps: profiles the client (niche, size, services, positioning, current marketing) → picks its top 3 competitors → deep dives each one channel by channel (Meta ads, LinkedIn organic + ads, Google ads, SEO, cold outbound, newsletter, events, partners, reviews) → builds the replication playbook (plays to copy and how we adapt them, gaps, prioritized channel plan, first 30 days) plus the research brief the writers use | Web search + web fetch |
| **Cold email** | One 3 to 4 step sequence per top angle, with merge tags | Reads the latest research |
| **LinkedIn content** | A week of posts for the firm owner | Reads the latest research |
| **Critic** | Scores every draft 1 to 10 against a rubric. Under 8 goes back to the writer with specific fixes (up to 2 revisions) | Brief + rubric |

Every research finding is tagged **observed** (seen in a source) or **inferred** (read from indirect signals). Meta's Ad Library and logged-in LinkedIn usually won't load for the agents, so those channels come back as "unknown" rather than guessed. Paste what you see there into the run notes box and the agents treat it as observed.

Onboarding flow: New client → fill the intake (size, location, competitors they named, current marketing) and the brief → leave "Start onboarding research as soon as I save" checked → the client page opens and research starts. Results show up step by step as they land.

How a run works:

1. You click **Run** on a client page (optionally with a steer like "Texas construction firms only").
2. `POST /api/agents/runs` creates an `agent_runs` row with the pipeline state.
3. The browser calls `POST /api/agents/runs/:id/advance` once per step (research, write, critique, revise, critique…). Each call runs exactly one agent and saves the new state, so no request gets near serverless time limits.
4. If the tab closes or a step errors, the run stays paused at its last saved step. Hit **Resume** to continue or **Stop** to drop it.
5. Approve the output you're shipping. Copy buttons on every email and post.

Agents run on `claude-opus-5-5` with server-side refusal fallbacks enabled (`fallbacks: "default"`). Code lives in `lib/agents/`: `prompts.ts` (system prompts + house style), `schemas.ts` (strict output contracts), `pipelines.ts` (the state machine), `claude.ts` (the Claude call loop).

---

## Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript** end-to-end
- **Tailwind CSS** with a hand-tuned Cadence palette
- **Shadcn/ui** primitives (button, input, card, etc.) — always dark mode
- **Supabase** for Postgres + Auth (email/password, RLS, role-based access)
- **Recharts** for charts (added in the dashboard steps)
- **Vercel** for deployment

## Design system

| Token | Hex | Usage |
| --- | --- | --- |
| `ink-950` | `#0a0a0a` | Page background |
| `ink-900` | `#141414` | Sidebar / secondary surfaces |
| `ink-850` | `#1a1a1a` | Cards |
| `ink-700` | `#2a2a2a` | Borders |
| `crimson-600` | `#dc2626` | Primary CTAs, pipeline accents |
| `gold-500` | `#eab308` | Revenue, success, MRR highlights |
| `foreground` | `#f5f5f5` | Primary text |
| `muted-foreground` | `#a0a0a0` | Secondary text |

Display type: **Space Grotesk**. Body type: **Inter**. Radius `8px`. Interactive surfaces glow crimson on hover.

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. From **Settings → API**, copy the **Project URL** and the **anon public** key.
3. Copy `.env.example` to `.env.local` and fill them in:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### 3. Run the database migration

Open the Supabase dashboard → **SQL Editor** and run each file in order:

1. [`0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql)
2. [`0002_stage_entered_at.sql`](./supabase/migrations/0002_stage_entered_at.sql)
3. [`0003_cadence_gtm.sql`](./supabase/migrations/0003_cadence_gtm.sql): renames deal types, sources and stages for Cadence (existing rows keep their meaning), adds `leads.vertical`, and creates `clients` + `agent_runs`.
4. [`0004_onboarding_intel.sql`](./supabase/migrations/0004_onboarding_intel.sql): onboarding intake fields on `clients`.

0001 creates:

- `profiles` — extends `auth.users` with `role` (`admin` | `member`), auto-created via trigger on signup.
- `pipeline_stages` — seeded with the 9 default stages (New Lead → Delivered/Won → Lost).
- `leads` — all deal fields; `total_contract_value` is a generated column (`one_time_value + monthly_recurring_value * 12`).
- `activities` — append-only audit log per lead.
- **RLS policies** — admins see everything; members see only leads assigned to or created by them.

### 4. Make yourself an admin

The first user to sign up is created as `member` by default. Promote yourself via SQL:

```sql
update public.profiles set role = 'admin' where email = 'you@cadencegtm.com';
```

### 5. (Optional) Configure email confirmation

In **Supabase → Authentication → Providers → Email**, you can disable *Confirm email* for faster local testing. In production leave it on; the signup form hands off to `/auth/callback` automatically.

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login`. Create an account, promote it to admin (step 4), and you're in.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Import Project** → pick the repo.
3. Add the env vars from `.env.local` (including `ANTHROPIC_API_KEY`) in **Project Settings → Environment Variables**, setting `NEXT_PUBLIC_SITE_URL` to your production URL (e.g. `https://app.cadencegtm.com`).
4. In **Supabase → Authentication → URL Configuration**, add your Vercel URL to **Site URL** and **Redirect URLs** (specifically `https://app.cadencegtm.com/auth/callback`).
5. Deploy. The agent step route sets `maxDuration = 300`, which needs Fluid Compute (on by default for new Vercel projects).

---

## Project layout

```
app/
  (app)/
    dashboard/ pipeline/ leads/ sources/   # Sell
    clients/                               # Deliver: list + [id] agent console
    team/ settings/
  api/agents/runs/                         # create a run
  api/agents/runs/[id]/advance/            # run the next agent step
  login/ auth/
components/
  clients/        # brief form, agent console, run output, history
  leads/ pipeline/ dashboard/ sources/ layout/ ui/
  cadence-logo.tsx
lib/
  agents/         # claude.ts, prompts.ts, schemas.ts, pipelines.ts, runs.ts
  clients/        # queries, actions, schema, labels
  leads/ sources/ dashboard/ supabase/
supabase/migrations/
  0001_initial_schema.sql
  0002_stage_entered_at.sql
  0003_cadence_gtm.sql
  0004_onboarding_intel.sql
```

---

## Roadmap

- [x] Pipeline, leads, list view, dashboard, sources
- [x] Cadence rebrand + GTM deal types, channels, stages
- [x] Client briefs + agent team (research, cold email, LinkedIn, critic)
- [x] Onboarding research: client profile, top 3 competitor channel deep dives, replication playbook
- [ ] Client-facing onboarding form (shareable link that fills the brief)
- [ ] Screenshot upload for ad library intel (agents read the images)
- [ ] List building agent (pull + enrich prospects for a client's ICP)
- [ ] Push approved sequences to the sending tool (Instantly / Smartlead)
- [ ] Client-facing monthly report
- [ ] Text the agent team (Telegram or SMS)

---

## Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run start      # run the built app
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
