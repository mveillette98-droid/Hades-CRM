import { mantraForDate } from "@/lib/mantras";

interface MantraStripProps {
  greeting?: string;
}

/**
 * Dashboard hero strip. One harsh line per day. Server-rendered so
 * there's no flicker, and the same mantra sits there all day.
 */
export function MantraStrip({ greeting }: MantraStripProps) {
  const line = mantraForDate();

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-ink-700 bg-gradient-to-br from-ink-900 via-ink-850 to-ink-900 px-6 py-6 md:px-8 md:py-7"
      aria-label="Today's mantra"
    >
      {/* ambient crimson bleed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(circle at 100% 0%, rgba(220,38,38,0.18), transparent 55%)",
        }}
      />
      {/* faint blueprint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "linear-gradient(to right, black 20%, transparent 100%)",
        }}
      />

      <div className="relative flex flex-col gap-2">
        {greeting && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-crimson-500">
            <span className="h-px w-6 bg-crimson-500/70" />
            {greeting}
          </span>
        )}
        <p className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-[28px]">
          &ldquo;{line}&rdquo;
        </p>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Today&rsquo;s mark — Hades Blueprint
        </p>
      </div>
    </section>
  );
}
