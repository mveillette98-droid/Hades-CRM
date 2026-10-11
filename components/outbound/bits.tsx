import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const nativeSelect =
  "flex h-10 w-full rounded-md border border-ink-700 bg-ink-900 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-crimson-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "warn"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        tone === "ok" && "border-gold-700/50 bg-gold-900/10 text-gold-200",
        tone === "warn" && "border-gold-700/40 bg-gold-900/10 text-gold-200",
        tone === "error" && "border-crimson-800/60 bg-crimson-900/20 text-crimson-200"
      )}
    >
      {children}
    </p>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function pct(n: number, d: number): string {
  if (!d) return "0%";
  return `${Math.round((n / d) * 1000) / 10}%`;
}
