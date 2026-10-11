"use client";

import { useEffect, useRef } from "react";

const CAL_LINK = process.env.NEXT_PUBLIC_CAL_LINK;

type CalApi = ((...args: unknown[]) => void) & {
  ns: Record<string, (...args: unknown[]) => void>;
  loaded?: boolean;
  q?: unknown[];
};

/** Cal.com's official embed loader, as a function. Safe to call more than once. */
function loadCal(): CalApi {
  const w = window as unknown as { Cal?: CalApi };
  if (w.Cal) return w.Cal;
  /* eslint-disable */
  (function (C: any, A: string, L: string) {
    const p = function (a: any, ar: any) { a.q.push(ar); };
    const d = C.document;
    C.Cal = C.Cal || function () {
      const cal = C.Cal;
      const ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api: any = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === "string") {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ["initNamespace", namespace]);
        } else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, "https://app.cal.com/embed/embed.js", "init");
  /* eslint-enable */
  return (window as unknown as { Cal: CalApi }).Cal;
}

/**
 * Inline Cal.com booking calendar, prefilled with the lead's details.
 * Calls onBooked once when the booking goes through.
 */
export function CalBooking({
  leadId,
  name,
  email,
  onBooked,
}: {
  leadId: string;
  name: string;
  email: string;
  onBooked: () => void;
}) {
  const fired = useRef(false);
  const booked = useRef(onBooked);
  booked.current = onBooked;

  const started = useRef(false);

  useEffect(() => {
    // Once per mount, even when React runs effects twice in dev.
    if (!CAL_LINK || started.current) return;
    started.current = true;
    const Cal = loadCal();
    Cal("init", "teardown", { origin: "https://cal.com" });
    Cal.ns.teardown("inline", {
      elementOrSelector: "#teardown-cal",
      calLink: CAL_LINK,
      config: { layout: "month_view", name, email, "metadata[leadId]": leadId },
    });
    Cal.ns.teardown("ui", { theme: "dark", hideEventTypeDetails: false });
    const done = () => {
      if (fired.current) return;
      fired.current = true;
      booked.current();
    };
    Cal.ns.teardown("on", { action: "bookingSuccessful", callback: done });
    Cal.ns.teardown("on", { action: "bookingSuccessfulV2", callback: done });
  }, [leadId, name, email]);

  if (!CAL_LINK) {
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-900 p-6 text-sm text-muted-foreground">
        The calendar isn&apos;t connected yet. Set NEXT_PUBLIC_CAL_LINK (for example
        <span className="text-foreground"> cadencegtm/teardown</span>) and redeploy.
      </div>
    );
  }
  return <div id="teardown-cal" className="min-h-[640px] w-full overflow-auto" />;
}
