import Link from "next/link";
import { ArrowRight, Bot, KanbanSquare, Send } from "lucide-react";
import { CadenceLogo } from "@/components/cadence-logo";
import { mantraForDate } from "@/lib/mantras";
import { Backdrop } from "./backdrop";

const PILLARS = [
  { icon: KanbanSquare, title: "Sell", line: "Pipeline, leads and sources. Every deal, every stage." },
  { icon: Bot, title: "Deliver", line: "The agent team builds the research, the report and the copy." },
  { icon: Send, title: "Outbound", line: "Your own sender. Lists, sequences, replies, booked calls." },
];

/** Option B: split screen. Brand and what's inside on the left, the door on the right. */
export function LandingB() {
  return (
    <main className="relative grid min-h-screen overflow-hidden lg:grid-cols-[1.2fr_1fr]">
      <Backdrop />
      <section className="flex flex-col justify-between border-ink-800 px-6 py-10 sm:px-12 lg:border-r lg:py-14">
        <CadenceLogo size={36} showWordmark />
        <div className="my-12 lg:my-0">
          <p className="text-xs uppercase tracking-[0.32em] text-crimson-500">Operator Console</p>
          <h1 className="mt-4 max-w-xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Sell it on the phone. Deliver it with the agents.
          </h1>
          <ul className="mt-10 space-y-5">
            {PILLARS.map(({ icon: Icon, title, line }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-crimson-500">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden text-sm text-gold-400 lg:block">&ldquo;{mantraForDate()}&rdquo;</p>
      </section>

      <section className="flex items-center justify-center px-6 pb-16 sm:px-12 lg:py-14">
        <div className="w-full max-w-sm rounded-xl border border-ink-700 bg-ink-850/70 p-8 text-center shadow-card backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Welcome back</h2>
          <p className="mt-2 text-sm text-muted-foreground">Team members only.</p>
          <Link
            href="/login"
            className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-crimson-600 text-base font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.45)] transition-all hover:bg-crimson-500 hover:shadow-glow-crimson"
          >
            Log in
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-xs text-muted-foreground">
            Cadence GTM, a growth firm. <span className="text-crimson-500">Every beat on time.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
