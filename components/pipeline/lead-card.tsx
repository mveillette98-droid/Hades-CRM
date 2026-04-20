"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn, formatCompactCurrency, daysBetween } from "@/lib/utils";
import { DEAL_TYPE_SHORT } from "@/lib/leads/labels";
import { DealTypeIcon } from "@/components/leads/deal-type-icon";
import type { LeadWithJoins } from "@/lib/leads/queries";

interface LeadCardProps {
  lead: LeadWithJoins;
  dragOverlay?: boolean;
}

export function LeadCard({ lead, dragOverlay = false }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: { type: "lead", leadId: lead.id, fromStageId: lead.stage_id },
    disabled: dragOverlay,
  });

  const style = dragOverlay
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      };

  const since = lead.stage_entered_at || lead.updated_at;
  const days = daysBetween(since);
  const stale = days >= 7;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-ink-700 bg-ink-850 p-3 shadow-card transition-colors",
        !dragOverlay && "hover:border-crimson-800/60",
        dragOverlay && "cursor-grabbing border-crimson-600/60 shadow-glow-crimson"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag lead"
        className={cn(
          "absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity",
          "group-hover:opacity-100 focus:opacity-100",
          "cursor-grab active:cursor-grabbing hover:text-foreground",
          dragOverlay && "opacity-100"
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Link
        href={`/leads/${lead.id}`}
        className="block space-y-2 focus:outline-none"
        // Stop drag from hijacking the link. The handle (above) is the drag surface.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 pr-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {lead.company_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {lead.contact_name}
            </p>
          </div>
          <DealTypeIcon type={lead.deal_type} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {DEAL_TYPE_SHORT[lead.deal_type]}
          </span>
          <span className="font-display text-sm font-bold text-gold-300">
            {formatCompactCurrency(Number(lead.total_contract_value ?? 0))}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-ink-700 pt-2 text-[10px] uppercase tracking-wider">
          <span
            className={cn(
              "font-medium",
              stale ? "text-crimson-400" : "text-muted-foreground"
            )}
          >
            {stale ? "STALE · " : ""}
            {days === 0 ? "Today" : `${days}d in stage`}
          </span>
          {lead.monthly_recurring_value > 0 && (
            <span className="font-medium text-gold-400">
              {formatCompactCurrency(Number(lead.monthly_recurring_value))}/mo
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
