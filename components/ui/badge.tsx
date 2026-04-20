import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-ink-700 bg-ink-850 text-muted-foreground",
        crimson:
          "border-crimson-800/60 bg-crimson-900/30 text-crimson-300",
        gold:
          "border-gold-700/50 bg-gold-900/20 text-gold-300",
        outline: "border-ink-700 bg-transparent text-muted-foreground",
        won: "border-gold-700/60 bg-gold-900/20 text-gold-200",
        lost: "border-ink-700 bg-ink-800 text-muted-foreground line-through",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
