"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn, formatCompactCurrency } from "@/lib/utils";
import { LeadCard } from "./lead-card";
import type { LeadWithJoins } from "@/lib/leads/queries";
import type { PipelineStage } from "@/lib/supabase/types";

interface KanbanColumnProps {
  stage: PipelineStage;
  leads: LeadWithJoins[];
}

export function KanbanColumn({ stage, leads }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "column", stageId: stage.id },
  });

  const oneTime = leads.reduce(
    (sum, l) => sum + Number(l.one_time_value ?? 0),
    0
  );
  const mrr = leads.reduce(
    (sum, l) => sum + Number(l.monthly_recurring_value ?? 0),
    0
  );

  const accent = stage.is_won
    ? "border-gold-700/50"
    : stage.is_lost
    ? "border-ink-700"
    : "border-ink-700";

  const dot = stage.is_won
    ? "bg-gold-500"
    : stage.is_lost
    ? "bg-muted-foreground"
    : "bg-crimson-500";

  return (
    <section
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col rounded-lg border bg-ink-900",
        accent,
        isOver && "border-crimson-600/60 shadow-glow-crimson"
      )}
      aria-label={`${stage.name} column`}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-ink-700 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", dot)}
            aria-hidden
          />
          <h3 className="truncate font-display text-sm font-semibold tracking-tight">
            {stage.name}
          </h3>
        </div>
        <span className="rounded-full border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {leads.length}
        </span>
      </header>

      {/* Totals — one-time vs MRR separated */}
      <div className="grid grid-cols-2 gap-2 border-b border-ink-700 px-3 py-2 text-[10px] uppercase tracking-wider">
        <div>
          <p className="text-muted-foreground">One-time</p>
          <p className="font-display text-sm font-semibold text-foreground">
            {formatCompactCurrency(oneTime)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">MRR</p>
          <p className="font-display text-sm font-semibold text-gold-300">
            {mrr > 0 ? `${formatCompactCurrency(mrr)}/mo` : "—"}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
          isOver && "bg-crimson-950/10"
        )}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-ink-700 text-[10px] uppercase tracking-wider text-muted-foreground">
              Drop a lead here
            </div>
          ) : (
            leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
          )}
        </SortableContext>
      </div>
    </section>
  );
}
