import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CadenceLogo } from "@/components/cadence-logo";
import { Backdrop } from "./backdrop";

/** Option A: one centered splash, one button. */
export function LandingA() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <Backdrop />
      <CadenceLogo size={64} />
      <h1 className="mt-8 font-display text-5xl font-bold tracking-tight hb-gradient-text sm:text-6xl">
        Cadence GTM
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.32em] text-crimson-500">Operator Console</p>
      <p className="mt-6 max-w-md text-base text-muted-foreground">
        Sell it on the phone. Deliver it with the agents. Book the calls that keep firms paying.
      </p>
      <Link
        href="/login"
        className="mt-10 inline-flex h-12 items-center gap-2 rounded-md bg-crimson-600 px-10 text-base font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.45)] transition-all hover:bg-crimson-500 hover:shadow-glow-crimson"
      >
        Log in
        <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="absolute bottom-8 text-xs text-muted-foreground">
        Cadence GTM, a growth firm. <span className="text-crimson-500">Every beat on time.</span>
      </p>
    </main>
  );
}
