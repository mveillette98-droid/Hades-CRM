import { Globe, Bot, Zap, Repeat, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealType } from "@/lib/supabase/types";

const MAP: Record<DealType, { Icon: typeof Globe; tint: string }> = {
  website_build:           { Icon: Globe,      tint: "text-sky-400" },
  ai_automation:           { Icon: Bot,        tint: "text-crimson-400" },
  website_plus_automation: { Icon: Zap,        tint: "text-violet-400" },
  retainer:                { Icon: Repeat,     tint: "text-gold-400" },
  other:                   { Icon: HelpCircle, tint: "text-muted-foreground" },
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
