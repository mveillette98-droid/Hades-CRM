"use client";

import { useRef, useState } from "react";
import { ArrowRight, CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CalBooking } from "./cal-booking";
import { trackPixel } from "./meta-pixel";

export type Attribution = Partial<
  Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "fbclid", string>
>;

const ROLES = ["Owner / Partner", "Managing Director", "Marketing / Growth", "Other"];
const SIZES = ["Just me", "2 to 10", "11 to 50", "51+"];

const selectClass =
  "flex h-10 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-crimson-600/60 focus-visible:ring-1 focus-visible:ring-crimson-600/40";

type Step = { kind: "form" } | { kind: "book"; leadId: string } | { kind: "done" };

export function TeardownFunnel({ attribution }: { attribution: Attribution }) {
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState({ name: "", email: "", phone: "" });
  const openedAt = useRef(Date.now());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const payload = {
      name: get("name"),
      email: get("email"),
      phone: get("phone"),
      firm: get("firm"),
      website: get("website"),
      role: get("role"),
      size: get("size"),
      problem: get("problem"),
      company_site: get("company_site"),
      elapsed: Date.now() - openedAt.current,
      ...attribution,
    };
    try {
      const res = await fetch("/api/teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { leadId?: string; error?: string };
      if (!res.ok || !json.leadId) {
        setError(json.error ?? "Something broke on our side. Try again in a minute.");
        return;
      }
      trackPixel("Lead", `lead-${json.leadId}`);
      setWho({ name: payload.name, email: payload.email, phone: payload.phone });
      setStep({ kind: "book", leadId: json.leadId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function booked(leadId: string) {
    trackPixel("Schedule", `booked-${leadId}`);
    setStep({ kind: "done" });
    await fetch("/api/teardown/booked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, email: who.email, phone: who.phone }),
    }).catch(() => undefined);
  }

  if (step.kind === "done") {
    return (
      <Panel>
        <div className="flex flex-col items-center py-6 text-center">
          <CalendarCheck className="h-10 w-10 text-crimson-500" />
          <h2 className="mt-4 font-display text-2xl font-bold">You&apos;re booked.</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            The invite is in your inbox. We start on your teardown now, so it&apos;s ready before
            we talk. Bring whoever else should hear it.
          </p>
        </div>
      </Panel>
    );
  }

  if (step.kind === "book") {
    return (
      <Panel>
        <StepTag n={2} />
        <h2 className="font-display text-2xl font-bold">Last step: pick a time.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          30 minutes. We build your teardown before the call and walk you through it live.
        </p>
        <div className="mt-6">
          <CalBooking
            leadId={step.leadId}
            name={who.name}
            email={who.email}
            onBooked={() => booked(step.leadId)}
          />
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <StepTag n={1} />
      <h2 className="font-display text-2xl font-bold">Get your free teardown</h2>
      <p className="mt-1 text-sm text-muted-foreground">Takes about a minute. Then you pick a time.</p>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" autoComplete="name" required />
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field label="Firm name" name="firm" autoComplete="organization" required />
        <Field label="Firm website" name="website" placeholder="yourfirm.com" autoComplete="url" required />
        <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />
        <div className="space-y-1.5">
          <Label htmlFor="role">Your role</Label>
          <select id="role" name="role" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Pick one
            </option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="size">People at the firm</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SIZES.map((s, i) => (
              <label
                key={s}
                className="flex cursor-pointer items-center justify-center rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm has-[:checked]:border-crimson-600 has-[:checked]:bg-crimson-950/40"
              >
                <input type="radio" name="size" value={s} required={i === 0} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="problem">What&apos;s holding growth back right now? (optional)</Label>
          <Textarea
            id="problem"
            name="problem"
            rows={3}
            placeholder="Referrals dried up, we can't hire fast enough, nobody answers our emails..."
          />
        </div>

        {/* Honeypot. Hidden from people, filled by bots. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Company site
            <input type="text" name="company_site" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {error && <p className="text-sm text-crimson-400 sm:col-span-2">{error}</p>}

        <Button type="submit" size="lg" disabled={pending} className="sm:col-span-2">
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {pending ? "Sending" : "Get my teardown"}
        </Button>
        <p className="text-center text-xs text-muted-foreground sm:col-span-2">
          No spam, no newsletter. We use this to build your teardown and book the call.
        </p>
      </form>
    </Panel>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-ink-700 bg-ink-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

function StepTag({ n }: { n: 1 | 2 }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-crimson-500">Step {n} of 2</p>
  );
}
