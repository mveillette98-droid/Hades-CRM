import { cn } from "@/lib/utils";

interface PulseDotProps {
  className?: string;
  label?: string;
  variant?: "crimson" | "gold";
}

export function PulseDot({
  className,
  label,
  variant = "crimson",
}: PulseDotProps) {
  const color = variant === "gold" ? "bg-gold-500" : "bg-crimson-500";
  const ring =
    variant === "gold" ? "bg-gold-500/30" : "bg-crimson-500/30";
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
            ring
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full animate-pulse-dot",
            color
          )}
        />
      </span>
      {label && (
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
