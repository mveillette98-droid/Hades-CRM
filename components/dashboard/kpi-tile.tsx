import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: "crimson" | "gold" | "muted";
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
}

export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = "crimson",
  trend,
}: KpiTileProps) {
  const accentText =
    accent === "gold"
      ? "text-gold-300"
      : accent === "muted"
      ? "text-foreground"
      : "text-foreground";

  const accentGlow =
    accent === "gold"
      ? "shadow-[inset_0_0_0_1px_rgba(234,179,8,0.25)]"
      : accent === "crimson"
      ? "shadow-[inset_0_0_0_1px_rgba(220,38,38,0.25)]"
      : "";

  const iconBg =
    accent === "gold"
      ? "bg-gold-500/10 text-gold-300"
      : accent === "crimson"
      ? "bg-crimson-600/10 text-crimson-400"
      : "bg-ink-800 text-muted-foreground";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 p-4 transition-colors hover:border-ink-600",
        accentGlow
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "font-display text-2xl font-semibold tracking-tight md:text-[28px]",
              accentText
            )}
          >
            {value}
          </p>
          {sub && (
            <p className="text-xs text-muted-foreground">{sub}</p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              iconBg
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {trend && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider",
            trend.direction === "up" && "text-gold-400",
            trend.direction === "down" && "text-crimson-400",
            trend.direction === "flat" && "text-muted-foreground"
          )}
        >
          {trend.direction === "up" && "▲"}
          {trend.direction === "down" && "▼"}
          {trend.direction === "flat" && "—"}
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  );
}
