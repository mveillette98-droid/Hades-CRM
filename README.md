# Cadence GTM

Operator console for Cadence GTM, a growth firm that books qualified sales calls for professional services firms (starting with accounting / CAS).

Two halves in one app:

- **Sell**: pipeline, leads, sources, dashboard. Tracks your own deals from first dial to signed.
- **Deliver**: client briefs plus an agent team that does the fulfillment work. Research feeds the writers, and every draft goes through a critic before you see it.

---

## The agent team

Each client gets one brief (intake + offer, ICP, pains, differentiators, proof, voice, off-limits). Every agent reads it.

### Onboarding: Research agent → Chrome capture → Strategy agent

| Step | Agent | Output |
| --- | --- | --- |
| 1 | Research | Client profile: niche, services, size, locations, positioning, current marketing, strengths, weaknesses |
| 2 | Research | Top 3 competitors (starts from the ones the client named) |
| 3 | **Chrome capture** (your laptop) | Screenshots + page text of each competitor's Meta Ad Library, LinkedIn Ad Library, Google Ads Transparency, LinkedIn posts, website |
| 4 | Research | Deep dive per competitor, channel by channel, reading the screenshots |
| 5 | Strategy | Research brief + replication playbook (plays to copy, gaps, channel plan, first 30 days) |
| 6 | Strategy | Market analysis report: exec summary, market, personas, pain points, competitive matrix, positioning + messaging, strategic rationale, KPIs, risks |
| 7 | Strategy | Scripts: cold call, LinkedIn DMs, Meta ads, video ad, sales call talk track |

The report lives at `/clients/:id/report/:runId` with every screenshot embedded. Hit **Save as PDF**.

Every finding is tagged **observed** or **inferred**. Nothing gets guessed: channels the agents can't see come back "unknown".

### Writers

| Agent | What it does |
| --- | --- |
| **Cold email** | One 3 to 4 step sequence per top angle, with merge tags |
| **LinkedIn content** | A week of posts for the firm owner |
| **Critic** | Scores every draft 1 to 10. Under 8 goes back to the writer with fixes (up to 2 revisions) |

### Chrome capture agent

Runs on your laptop in its own Chrome profile (`.cadence-chrome/`, gitignored), separate from your everyday browser.

```bash
npm install
npm run capture -- --login        # one time: log into Facebook + LinkedIn (use a secondary account if you have one)
npm run capture -- <runId>        # the client page shows this command with the run id filled in
npm run capture -- <runId> --no-linkedin-pages   # skip logged-in LinkedIn pages
```

Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (laptop only, never in Vercel client code). No site-specific selectors: it loads each page, scrolls, screenshots, and grabs the visible text, so layout changes don't break it. It paces itself between pages. When it finishes it releases the run and the deep dives start on their own.

Heads up: automated browsing of LinkedIn and Facebook is against their terms. Keep volume low (3 competitors per client is fine), use a secondary account where you can, or skip capture and paste what you see into the run notes instead.

### How runs stay up

- **One step per request.** Each agent call is its own HTTP request with state saved after it, so a crash loses one step, not the run.
- **Step budget.** A step stops itself at about 250s, before Vercel's 300s limit, so the failure is recorded and retried instead of the function dying mid-write.
- **Retries.** The SDK retries rate limits and 5xx errors. The browser retries a failed step 3 times with backoff (5s, 15s, 30s) before asking you.
- **Lock.** A run can only advance in one place at a time. A second tab waits.
- **Skip, don't stall.** A competitor whose deep dive fails twice is skipped, flagged in the report, and the run carries on.
- **Resume.** Close the tab mid-run and hit Resume later. It picks up from the last finished step.
- **Strict outputs.** Every agent returns through a strict JSON schema, so the UI never gets half-shaped data.
- **Refusal fallback.** Server-side fallbacks re-run a declined request on another model.

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
5. [`0005_capture_report_hardening.sql`](./supabase/migrations/0005_capture_report_hardening.sql): run lock, `intel_captures` table, private `intel` storage bucket for screenshots.

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
  0005_capture_report_hardening.sql
scripts/
  capture.ts         # Chrome capture agent (runs on your laptop)
  capture-lib.ts
```

---

## Roadmap

- [x] Pipeline, leads, list view, dashboard, sources
- [x] Cadence rebrand + GTM deal types, channels, stages
- [x] Client briefs + agent team (research, cold email, LinkedIn, critic)
- [x] Onboarding research: client profile, top 3 competitor channel deep dives, replication playbook
- [ ] Client-facing onboarding form (shareable link that fills the brief)
- [x] Chrome capture agent + screenshots in the deep dives
- [x] Market analysis report with scripts, printable to PDF
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
