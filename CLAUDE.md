# Cadence GTM — context for Claude Code

Operator console for **Cadence GTM**, a growth firm that books qualified sales calls for professional services firms, starting with accounting / CAS firms. The owner is Matt: a closer, not a developer. Talk plainly, keep it short, no em dashes.

## Where things stand

- Branch `claude/marketing-agency-tool-b5fjxe`, draft PR #1. Vercel preview builds green.
- **Current plan: run it locally as an internal tool** (`npm run dev` on the laptop). No production deploy until one real firm has gone through onboarding end to end and the report holds up in front of a partner.
- Nothing has run against the live Claude API or real Facebook / LinkedIn yet. The first real onboarding run is the real test. Expect to fix things.

## Local setup checklist

1. `npm install`
2. Supabase SQL editor: run `supabase/migrations/0003_cadence_gtm.sql`, `0004_onboarding_intel.sql`, `0005_capture_report_hardening.sql`, `0006_outbound.sql`, `0007_outbound_setup.sql` in order (0001 and 0002 are already applied).
3. `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CADENCE_SECRET_KEY` (any long random string: `openssl rand -base64 32`).
4. `npm run dev`, open http://localhost:3000.
5. `npm run capture -- --login` once, then Matt logs into Facebook and LinkedIn himself in the Chrome window. Never ask him for passwords in chat.
6. Cold email: add inboxes on `/outbound` (Matt types the app passwords into the form himself), then `npm run sender` in a terminal while campaigns are live.

## How it works (short)

- **Sell:** dashboard, pipeline, leads, sources (Matt's own deals).
- **Deliver:** `/clients`. Each client has a brief. Agents live in `lib/agents/`:
  - `pipelines.ts` is a resumable state machine. Research agent: profile → competitors → [Chrome capture pause] → dive ×3. Strategy agent: strategy (playbook + brief) → report → scripts. Writers: write → critique ⇄ revise.
  - `claude.ts` wraps every Claude call: strict submit tool, web search/fetch for research, ~250s step budget, `fallbacks: "default"`.
  - `prompts.ts` holds the system prompts and house style. `schemas.ts` holds the strict output contracts.
- API: `POST /api/agents/runs` creates a run. `POST /api/agents/runs/:id/advance` runs exactly one step (with a lock). The browser drives the loop and retries.
- `scripts/capture.ts` is the Chrome capture agent (Playwright, dedicated profile in `.cadence-chrome/`).
- Report page: `/clients/:id/report/:runId` (print to PDF).
- **Outbound** (`/outbound`, `lib/outbound/`): Cadence's own sender, no Instantly. `engine.ts` is one `tick`: send due steps (per-inbox 24h cap + gap with jitter, send window in the campaign time zone, follow-ups threaded from the same inbox, missing merge tag blocks the send), then read each inbox over IMAP (reply stops the lead, out-of-office ignored, unsubscribe and bounce go to `suppressions`). `transport.ts` wraps nodemailer / imapflow behind small interfaces. `scripts/sender.ts` runs `tick` every minute (`npm run sender`). App passwords are AES-GCM encrypted with `CADENCE_SECRET_KEY` (`crypto.ts`). It does not warm inboxes: that stays a separate service. The engine skips any inbox with under `warmup_min_days` (14) of warmup and auto-pauses an inbox whose 7-day bounce rate passes 3%.
- **Outbound setup** (`/outbound/setup`): `dns.ts` checks MX, SPF, DKIM, DMARC per sending domain (system resolver, DNS-over-HTTPS fallback) and returns the exact record to add. `readiness.ts` is the launch checklist (copy approved, logins tested, DNS passing, warmed, not the client's main domain, verified list, test sent); `setCampaignStatus` refuses to start a campaign with a failing item.

## Checks before pushing

- `npx tsc --noEmit`
- `npx next build` (needs `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, dummy values are fine)
- There is no ESLint config; `npm run lint` prompts interactively, so skip it.

## Next up (not built)

- Client-facing onboarding form (shareable link that fills the brief).
- Contacts per client + Apollo import (next), list building agent, monthly client report (pull reply and booked-call counts from `/outbound`).
- Sender on a server instead of the laptop (it's a plain loop; any always-on box works).
- Text the agent team (Telegram or SMS).
