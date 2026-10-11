import { Send, Wrench, PenLine, Target, Layers, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealType } from "@/lib/supabase/types";

const MAP: Record<DealType, { Icon: typeof Send; tint: string }> = {
  outbound_retainer: { Icon: Send,       tint: "text-crimson-400" },
  gtm_setup:         { Icon: Wrench,     tint: "text-sky-400" },
  content_retainer:  { Icon: PenLine,    tint: "text-gold-400" },
  paid_ads:          { Icon: Target,     tint: "text-emerald-400" },
  full_gtm:          { Icon: Layers,     tint: "text-violet-400" },
  other:             { Icon: HelpCircle, tint: "text-muted-foreground" },
};

export function DealTypeIcon({
  type,
  className,
}: {
  type: DealType;
  className?: string;
}) {
  const { Icon, tint } = MAP[type];
  return <Icon className={cn("h-4 w-4", tint, className)} aria-hidden />;
}
