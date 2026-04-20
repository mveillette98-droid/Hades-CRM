"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DealTypeIcon } from "@/components/leads/deal-type-icon";
import { StageBadge } from "@/components/leads/stage-badge";
import { BulkActionBar } from "@/components/leads/bulk-action-bar";
import { DEAL_TYPES, DEAL_TYPE_SHORT, LEAD_SOURCES, LEAD_SOURCE_LABEL } from "@/lib/leads/labels";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { LeadWithJoins } from "@/lib/leads/queries";
import type {
  DealType,
  LeadSource,
  PipelineStage,
  Profile,
} from "@/lib/supabase/types";

type SortKey =
  | "company"
  | "contact"
  | "deal_type"
  | "stage"
  | "source"
  | "mrr"
  | "tcv"
  | "created_at"
  | "days_in_stage";

type SortDir = "asc" | "desc";

interface FilterState {
  stage_id: string | "all" | "open" | "won" | "lost";
  deal_type: DealType | "all";
  source: LeadSource | "all";
  assigned_to: string | "all";
}

const DEFAULT_FILTERS: FilterState = {
  stage_id: "all",
  deal_type: "all",
  source: "all",
  assigned_to: "all",
};

interface LeadsListProps {
  leads: LeadWithJoins[];
  stages: PipelineStage[];
  team: Pick<Profile, "id" | "full_name" | "email">[];
  isAdmin: boolean;
}

export function LeadsList({ leads, stages, team, isAdmin }: LeadsListProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (q) {
        const hay = [l.company_name, l.contact_name, l.email, l.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.deal_type !== "all" && l.deal_type !== filters.deal_type) return false;
      if (filters.source !== "all" && l.source !== filters.source) return false;
      if (filters.assigned_to !== "all" && l.assigned_to !== filters.assigned_to) return false;

      if (filters.stage_id === "open") {
        if (l.stage?.is_won || l.stage?.is_lost) return false;
      } else if (filters.stage_id === "won") {
        if (!l.stage?.is_won) return false;
      } else if (filters.stage_id === "lost") {
        if (!l.stage?.is_lost) return false;
      } else if (filters.stage_id !== "all") {
        if (l.stage_id !== filters.stage_id) return false;
      }
      return true;
    });
  }, [leads, query, filters]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const filteredIds = useMemo(() => sorted.map((l) => l.id), [sorted]);
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && filteredIds.some((id) => selected.has(id));

  const totalTCV = leads.reduce((s, l) => s + Number(l.total_contract_value ?? 0), 0);
  const totalMRR = leads.reduce((s, l) => s + Number(l.monthly_recurring_value ?? 0), 0);
  const visibleTCV = sorted.reduce((s, l) => s + Number(l.total_contract_value ?? 0), 0);
  const visibleMRR = sorted.reduce((s, l) => s + Number(l.monthly_recurring_value ?? 0), 0);

  const isFiltered =
    query.trim() !== "" ||
    filters.stage_id !== "all" ||
    filters.deal_type !== "all" ||
    filters.source !== "all" ||
    filters.assigned_to !== "all";

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "tcv" || key === "mrr" ? "desc" : "asc");
    }
  }

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const id of filteredIds) next.delete(id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const id of filteredIds) next.add(id);
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected]
  );

  return (
    <div className="space-y-4">
      {/* Stat strip */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{sorted.length}</span>
          {sorted.length === leads.length ? "" : ` of ${leads.length}`} shown
        </span>
        <span className="h-3 w-px bg-ink-700" />
        <span>
          TCV{" "}
          <span className="font-semibold text-gold-300">
            {formatCompactCurrency(isFiltered ? visibleTCV : totalTCV)}
          </span>
        </span>
        <span className="h-3 w-px bg-ink-700" />
        <span>
          MRR{" "}
          <span className="font-semibold text-gold-300">
            {formatCompactCurrency(isFiltered ? visibleMRR : totalMRR)}
          </span>
        </span>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 p-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, contact, email, phone"
            className="h-8 pl-8 text-xs"
            aria-label="Search leads"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <span className="inline-flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          <Filter className="h-3 w-3" />
          Filter
        </span>

        <MiniSelect
          value={filters.stage_id}
          onChange={(v) => setFilters({ ...filters, stage_id: v as FilterState["stage_id"] })}
          placeholder="Stage"
          options={[
            { value: "all", label: "All stages" },
            { value: "open", label: "Open only" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
            ...stages.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />

        <MiniSelect
          value={filters.deal_type}
          onChange={(v) => setFilters({ ...filters, deal_type: v as DealType | "all" })}
          placeholder="Deal type"
          options={[
            { value: "all", label: "All deal types" },
            ...DEAL_TYPES.map((d) => ({ value: d.value, label: d.label })),
          ]}
        />

        <MiniSelect
          value={filters.source}
          onChange={(v) => setFilters({ ...filters, source: v as LeadSource | "all" })}
          placeholder="Source"
          options={[
            { value: "all", label: "All sources" },
            ...LEAD_SOURCES.map((s) => ({ value: s.value, label: s.label })),
          ]}
        />

        <MiniSelect
          value={filters.assigned_to}
          onChange={(v) => setFilters({ ...filters, assigned_to: v })}
          placeholder="Assignee"
          options={[
            { value: "all", label: "All assignees" },
            ...team.map((p) => ({
              value: p.id,
              label: p.full_name || p.email,
            })),
          ]}
        />

        {(isFiltered || sortKey !== "created_at" || sortDir !== "desc") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilters(DEFAULT_FILTERS);
              setSortKey("created_at");
              setSortDir("desc");
            }}
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-crimson-800/60 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-300"
        >
          {errorMsg}
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedIds={Array.from(selected)}
        selectedLeads={selectedLeads}
        stages={stages}
        team={team}
        isAdmin={isAdmin}
        onClear={() => setSelected(new Set())}
        onError={(m) => setErrorMsg(m)}
      />

      {/* Table */}
      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-display text-base font-semibold">
              No leads match these filters.
            </p>
            <p className="text-sm text-muted-foreground">
              Loosen the filters or clear the search to see the full board.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : someSelected
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={toggleAll}
                      aria-label="Select all visible"
                    />
                  </TableHead>
                  <SortableHead
                    label="Company"
                    k="company"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Contact"
                    k="contact"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Deal"
                    k="deal_type"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Stage"
                    k="stage"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Source"
                    k="source"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    label="Days"
                    k="days_in_stage"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="MRR"
                    k="mrr"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="TCV"
                    k="tcv"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((lead) => {
                  const isSel = selected.has(lead.id);
                  const days = daysInStage(lead);
                  const stale = days >= 7;
                  return (
                    <TableRow
                      key={lead.id}
                      data-state={isSel ? "selected" : undefined}
                      className={cn(
                        isSel && "bg-crimson-950/10 hover:bg-crimson-950/20"
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleOne(lead.id)}
                          aria-label={`Select ${lead.company_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-foreground hover:text-crimson-400"
                        >
                          {lead.company_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{lead.contact_name}</span>
                          {lead.email && (
                            <span className="text-xs text-muted-foreground">
                              {lead.email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <DealTypeIcon type={lead.deal_type} />
                          {DEAL_TYPE_SHORT[lead.deal_type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={lead.stage} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {LEAD_SOURCE_LABEL[lead.source]}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs font-medium uppercase tracking-wider",
                          stale ? "text-crimson-400" : "text-muted-foreground"
                        )}
                      >
                        {days === 0 ? "Today" : `${days}d`}
                        {stale ? " · stale" : ""}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gold-300">
                        {lead.monthly_recurring_value > 0
                          ? `${formatCompactCurrency(Number(lead.monthly_recurring_value))}/mo`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCompactCurrency(Number(lead.total_contract_value ?? 0))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// -------------------- helpers --------------------

function sortValue(lead: LeadWithJoins, key: SortKey): string | number | null {
  switch (key) {
    case "company":
      return lead.company_name.toLowerCase();
    case "contact":
      return lead.contact_name.toLowerCase();
    case "deal_type":
      return lead.deal_type;
    case "stage":
      return lead.stage?.position ?? 999;
    case "source":
      return lead.source;
    case "mrr":
      return Number(lead.monthly_recurring_value ?? 0);
    case "tcv":
      return Number(lead.total_contract_value ?? 0);
    case "created_at":
      return new Date(lead.created_at).getTime();
    case "days_in_stage":
      return daysInStage(lead);
  }
}

function daysInStage(lead: LeadWithJoins): number {
  const since = lead.stage_entered_at || lead.updated_at;
  if (!since) return 0;
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// -------------------- sub-components --------------------

function SortableHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          align === "right" && "ml-auto"
        )}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
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
      <SelectTrigger className="h-8 w-auto min-w-[130px] gap-1.5 text-xs">
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
