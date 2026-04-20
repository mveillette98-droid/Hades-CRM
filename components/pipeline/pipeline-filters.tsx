"use client";

import { Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DEAL_TYPES, LEAD_SOURCES } from "@/lib/leads/labels";
import type {
  DealType,
  LeadSource,
  Profile,
} from "@/lib/supabase/types";
import type { LeadWithJoins } from "@/lib/leads/queries";

export type DateRangeKey = "all" | "7d" | "30d" | "90d" | "quarter";

export interface PipelineFilterState {
  deal_type: DealType | "all";
  source: LeadSource | "all";
  assigned_to: string | "all";
  date_range: DateRangeKey;
}

const DEFAULT: PipelineFilterState = {
  deal_type: "all",
  source: "all",
  assigned_to: "all",
  date_range: "all",
};

const DATE_RANGES: { value: DateRangeKey; label: string }[] = [
  { value: "all",     label: "All time" },
  { value: "7d",      label: "Last 7 days" },
  { value: "30d",     label: "Last 30 days" },
  { value: "90d",     label: "Last 90 days" },
  { value: "quarter", label: "This quarter" },
];

export function applyFilters(
  leads: LeadWithJoins[],
  f: PipelineFilterState
): LeadWithJoins[] {
  const cutoff = dateCutoff(f.date_range);
  return leads.filter((lead) => {
    if (f.deal_type !== "all" && lead.deal_type !== f.deal_type) return false;
    if (f.source !== "all" && lead.source !== f.source) return false;
    if (f.assigned_to !== "all" && lead.assigned_to !== f.assigned_to) return false;
    if (cutoff && new Date(lead.created_at).getTime() < cutoff) return false;
    return true;
  });
}

function dateCutoff(range: DateRangeKey): number | null {
  const now = new Date();
  switch (range) {
    case "7d":
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return now.getTime() - 90 * 24 * 60 * 60 * 1000;
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return start.getTime();
    }
    default:
      return null;
  }
}

interface PipelineFiltersProps {
  state: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  team: Pick<Profile, "id" | "full_name" | "email">[];
  visibleCount: number;
  totalCount: number;
}

export function PipelineFilters({
  state,
  onChange,
  team,
  visibleCount,
  totalCount,
}: PipelineFiltersProps) {
  const isFiltered =
    state.deal_type !== "all" ||
    state.source !== "all" ||
    state.assigned_to !== "all" ||
    state.date_range !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 p-2">
      <span className="inline-flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Filter className="h-3 w-3" />
        Filter
      </span>

      <MiniSelect
        value={state.deal_type}
        onChange={(v) => onChange({ ...state, deal_type: v as DealType | "all" })}
        placeholder="Deal type"
        options={[
          { value: "all", label: "All deal types" },
          ...DEAL_TYPES.map((d) => ({ value: d.value, label: d.label })),
        ]}
      />

      <MiniSelect
        value={state.source}
        onChange={(v) => onChange({ ...state, source: v as LeadSource | "all" })}
        placeholder="Source"
        options={[
          { value: "all", label: "All sources" },
          ...LEAD_SOURCES.map((s) => ({ value: s.value, label: s.label })),
        ]}
      />

      <MiniSelect
        value={state.assigned_to}
        onChange={(v) => onChange({ ...state, assigned_to: v })}
        placeholder="Assignee"
        options={[
          { value: "all", label: "All assignees" },
          ...team.map((p) => ({
            value: p.id,
            label: p.full_name || p.email,
          })),
        ]}
      />

      <MiniSelect
        value={state.date_range}
        onChange={(v) => onChange({ ...state, date_range: v as DateRangeKey })}
        placeholder="Date range"
        options={DATE_RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {visibleCount === totalCount
            ? `${totalCount} leads`
            : `${visibleCount} of ${totalCount}`}
        </span>
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT)}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function MiniSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
