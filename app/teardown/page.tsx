import type { Metadata } from "next";
import { ArrowDown, Check } from "lucide-react";
import { CadenceLogo } from "@/components/cadence-logo";
import { MetaPixel } from "@/components/teardown/meta-pixel";
import { TeardownFunnel, type Attribution } from "@/components/teardown/teardown-funnel";

export const metadata: Metadata = {
  title: "Free competitor teardown for accounting firms · Cadence GTM",
  description:
    "See exactly how the 3 firms you're losing clients to are getting them. Free, built for your firm, walked through on a 30 minute call.",
  robots: { index: false },
};

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

const GETS = [
  "Who your top 3 competitors are and what they actually sell",
  "Where their clients come from: ads, outbound, referrals, content",
  "The gaps they leave open that your firm can take",
  "A first plan for putting more qualified sales calls on your calendar every month",
];

/**
 * Public. The Meta ads landing page. Everything else in the app sits behind
 * the login; this page and /api/teardown are the only public routes.
 */
export default function TeardownPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const attribution: Attribution = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = searchParams[k];
    if (typeof v === "string" && v) attribution[k] = v.slice(0, 500);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <MetaPixel />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% -10%, rgba(220,38,38,0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 50% 110%, rgba(234,179,8,0.05), transparent 60%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <CadenceLogo size={32} showWordmark />

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-crimson-500">
              For accounting and CAS firms
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              See how the 3 firms you lose clients to are getting them.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Free competitor teardown. We pull apart your top competitors&apos; offers, pricing,
              ads and outbound, then walk you through it on a 30 minute call.
            </p>
            <a
              href="#get-teardown"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-crimson-600 px-6 text-sm font-medium text-white hover:bg-crimson-500 lg:hidden"
            >
              Get my free teardown
              <ArrowDown className="h-4 w-4" />
            </a>

            <ul className="mt-8 space-y-3">
              {GETS.map((g) => (
                <li key={g} className="flex gap-3 text-sm sm:text-base">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-crimson-500" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>

            <p className="mt-8 border-l-2 border-crimson-700 pl-4 text-sm text-muted-foreground">
              No pitch deck. If the call isn&apos;t useful, you still keep the teardown.
            </p>
          </section>

          <section id="get-teardown" className="scroll-mt-6">
            <TeardownFunnel attribution={attribution} />
          </section>
        </div>

        <p className="mt-16 text-center text-xs text-muted-foreground">
          Cadence GTM, a growth firm for accounting and CAS firms.
        </p>
      </div>
    </main>
  );
}
