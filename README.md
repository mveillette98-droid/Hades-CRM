# Hades Blueprint CRM

Pipeline + revenue intelligence for Hades Blueprint — custom web builds, AI automation contracts, and recurring retainers. Dark, bold, unapologetic.

> **Status:** Step 1 of 9 — project scaffold, auth, and schema complete. Full build order is at the bottom of this file.

---

## Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript** end-to-end
- **Tailwind CSS** with a hand-tuned Hades Blueprint palette
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
   ```

### 3. Run the database migration

Open the Supabase dashboard → **SQL Editor** → paste the contents of
[`supabase/migrations/0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql) → **Run**.

The migration creates:

- `profiles` — extends `auth.users` with `role` (`admin` | `member`), auto-created via trigger on signup.
- `pipeline_stages` — seeded with the 9 default stages (New Lead → Delivered/Won → Lost).
- `leads` — all deal fields; `total_contract_value` is a generated column (`one_time_value + monthly_recurring_value * 12`).
- `activities` — append-only audit log per lead.
- **RLS policies** — admins see everything; members see only leads assigned to or created by them.

### 4. Make yourself an admin

The first user to sign up is created as `member` by default. Promote yourself via SQL:

```sql
update public.profiles set role = 'admin' where email = 'you@hadesblueprint.com';
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
3. Add the same three env vars from `.env.local` in **Project Settings → Environment Variables**, setting `NEXT_PUBLIC_SITE_URL` to your production URL (e.g. `https://crm.hadesblueprint.com`).
4. In **Supabase → Authentication → URL Configuration**, add your Vercel URL to **Site URL** and **Redirect URLs** (specifically `https://crm.hadesblueprint.com/auth/callback`).
5. Deploy.

---

## Project layout

```
app/
  (app)/                 # authenticated routes share a sidebar layout
    dashboard/
    pipeline/
    leads/
    team/                # admin-only, guarded in the page itself
    settings/
    layout.tsx           # sidebar shell; redirects to /login if signed out
  auth/
    callback/            # OAuth / email-confirm callback
    signout/             # POST-only signout
  login/
    page.tsx             # branded login + signup
    login-form.tsx       # client form
    actions.ts           # server actions (signIn/signUp/signOut)
  layout.tsx             # root — loads fonts, forces dark
  globals.css            # Tailwind base + palette variables
components/
  ui/                    # shadcn primitives (button, input, card, ...)
  layout/                # sidebar-nav, top-bar
  hb-logo.tsx            # Hades Blueprint monogram
  pulse-dot.tsx          # custom loading / status animation
lib/
  supabase/
    client.ts            # browser client
    server.ts            # server client (cookies)
    middleware.ts        # session refresh + route guard
    types.ts             # DB types (replace with generated types later)
  utils.ts               # cn(), currency formatting, TCV helper
middleware.ts            # runs updateSession on every non-static route
supabase/
  migrations/
    0001_initial_schema.sql
```

---

## Build order (as agreed)

- [x] **Step 1 — Project scaffold + auth** ← *you are here*
- [ ] **Step 2** — Lead CRUD + database wiring
- [ ] **Step 3** — Kanban pipeline board (drag-and-drop)
- [ ] **Step 4** — List view + search + bulk actions
- [ ] **Step 5** — Overview dashboard
- [ ] **Step 6** — Content/Source dashboard *(most important for HB)*
- [ ] **Step 7** — Delivery dashboard
- [ ] **Step 8** — Personal dashboard
- [ ] **Step 9** — Polish, empty states, branding touches

Check in after each step to test before moving on.

---

## Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run start      # run the built app
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
