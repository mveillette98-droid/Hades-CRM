"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { changeLeadStage } from "@/lib/leads/actions";
import { KanbanColumn } from "./kanban-column";
import { LeadCard } from "./lead-card";
import { PipelineFilters, type PipelineFilterState, applyFilters } from "./pipeline-filters";
import { PulseDot } from "@/components/pulse-dot";
import type { LeadWithJoins } from "@/lib/leads/queries";
import type { PipelineStage, Profile } from "@/lib/supabase/types";

interface KanbanBoardProps {
  stages: PipelineStage[];
  leads: LeadWithJoins[];
  team: Pick<Profile, "id" | "full_name" | "email">[];
}

type Move = { leadId: string; toStageId: string };

export function KanbanBoard({ stages, leads, team }: KanbanBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PipelineFilterState>({
    deal_type: "all",
    source: "all",
    assigned_to: "all",
    date_range: "all",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [optimisticLeads, applyMove] = useOptimistic<LeadWithJoins[], Move>(
    leads,
    (state, move) =>
      state.map((l) =>
        l.id === move.leadId
          ? {
              ...l,
              stage_id: move.toStageId,
              stage: stages.find((s) => s.id === move.toStageId) ?? l.stage,
              stage_entered_at: new Date().toISOString(),
            }
          : l
      )
  );

  const filteredLeads = useMemo(
    () => applyFilters(optimisticLeads, filters),
    [optimisticLeads, filters]
  );

  const leadsByStage = useMemo(() => {
    const map = new Map<string, LeadWithJoins[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of filteredLeads) {
      const arr = map.get(l.stage_id);
      if (arr) arr.push(l);
    }
    return map;
  }, [filteredLeads, stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setErrorMsg(null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const lead = optimisticLeads.find((l) => l.id === leadId);
    if (!lead) return;

    // Dropped on a column → over.id is the stageId.
    // Dropped on another card → resolve the column via that card's stage_id.
    let toStageId: string | null = null;
    const overType = over.data.current?.type;
    if (overType === "column") {
      toStageId = String(over.id);
    } else if (overType === "lead") {
      const overLead = optimisticLeads.find((l) => l.id === String(over.id));
      toStageId = overLead?.stage_id ?? null;
    }

    if (!toStageId || toStageId === lead.stage_id) return;

    // Optimistic update must be wrapped in startTransition (React 19+ API requirement)
    startTransition(async () => {
      applyMove({ leadId, toStageId: toStageId! });
      const result = await changeLeadStage(leadId, toStageId!);
      if (!result.ok) {
        setErrorMsg(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  const activeLead = activeId
    ? optimisticLeads.find((l) => l.id === activeId)
    : null;

  return (
    <div className="flex h-full flex-col gap-4">
      <PipelineFilters
        state={filters}
        onChange={setFilters}
        team={team}
        visibleCount={filteredLeads.length}
        totalCount={leads.length}
      />

      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-crimson-800/60 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-300"
        >
          Couldn&rsquo;t move that card — {errorMsg}
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PulseDot label="Syncing stage change" />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage.get(stage.id) ?? []}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <div className="w-[264px]">
              <LeadCard lead={activeLead} dragOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
