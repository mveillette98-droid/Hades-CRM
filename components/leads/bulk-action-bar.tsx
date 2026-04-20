"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Users, MoveRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bulkChangeStage,
  bulkReassign,
  bulkDeleteLeads,
} from "@/lib/leads/actions";
import { leadsToCsv, downloadCsv } from "@/lib/leads/csv";
import type { LeadWithJoins } from "@/lib/leads/queries";
import type { PipelineStage, Profile } from "@/lib/supabase/types";

interface BulkActionBarProps {
  selectedIds: string[];
  selectedLeads: LeadWithJoins[];
  stages: PipelineStage[];
  team: Pick<Profile, "id" | "full_name" | "email">[];
  isAdmin: boolean;
  onClear: () => void;
  onError: (msg: string) => void;
}

export function BulkActionBar({
  selectedIds,
  selectedLeads,
  stages,
  team,
  isAdmin,
  onClear,
  onError,
}: BulkActionBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  function runStage(stageId: string) {
    startTransition(async () => {
      const r = await bulkChangeStage(selectedIds, stageId);
      if (!r.ok) onError(r.error);
      else {
        onClear();
        router.refresh();
      }
    });
  }

  function runReassign(assigneeId: string) {
    startTransition(async () => {
      const r = await bulkReassign(selectedIds, assigneeId);
      if (!r.ok) onError(r.error);
      else {
        onClear();
        router.refresh();
      }
    });
  }

  function runDelete() {
    startTransition(async () => {
      const r = await bulkDeleteLeads(selectedIds);
      if (!r.ok) onError(r.error);
      else {
        setConfirmDelete(false);
        onClear();
        router.refresh();
      }
    });
  }

  function exportCsv() {
    const csv = leadsToCsv(selectedLeads);
    downloadCsv(`hades-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-crimson-800/60 bg-crimson-950/20 px-3 py-2 shadow-glow-crimson backdrop-blur">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-crimson-600/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
        {count} selected
      </span>

      <div className="h-5 w-px bg-ink-700" />

      {/* Stage move */}
      <Select onValueChange={runStage} disabled={pending}>
        <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 text-xs">
          <MoveRight className="h-3.5 w-3.5" />
          <SelectValue placeholder="Move to stage" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Reassign */}
      <Select onValueChange={runReassign} disabled={pending}>
        <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5" />
          <SelectValue placeholder="Reassign to" />
        </SelectTrigger>
        <SelectContent>
          {team.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* CSV export */}
      <Button
        variant="outline"
        size="sm"
        onClick={exportCsv}
        disabled={pending}
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>

      {/* Delete — admin only */}
      {isAdmin &&
        (confirmDelete ? (
          <div className="flex items-center gap-1.5 rounded-md border border-crimson-700 bg-crimson-950/40 px-2 py-1">
            <span className="text-xs font-semibold text-crimson-200">
              Delete {count}?
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={runDelete}
              disabled={pending}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        ))}

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={pending}
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
