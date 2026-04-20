import type { LeadWithJoins } from "@/lib/leads/queries";
import type { PipelineStage } from "@/lib/supabase/types";

/**
 * Stage probabilities — position-based weighting for the forecast.
 * Matches the 9-stage seed from migration 0001:
 *   1 New Lead              → 5%
 *   2 Discovery Booked      → 15%
 *   3 Discovery Completed   → 30%
 *   4 Proposal Sent         → 50%
 *   5 Negotiation           → 70%
 *   6 Contract Signed       → 90%
 *   7 In Delivery           → 95%
 *   8 Delivered/Won         → 100%
 *   9 Lost                  → 0%
 *
 * `is_won` / `is_lost` flags override the table (so custom stages still behave).
 */
export function stageProbability(
  stage: Pick<PipelineStage, "position" | "is_won" | "is_lost"> | null
): number {
  if (!stage) return 0;
  if (stage.is_won) return 1;
  if (stage.is_lost) return 0;
  const table: Record<number, number> = {
    1: 0.05,
    2: 0.15,
    3: 0.3,
    4: 0.5,
    5: 0.7,
    6: 0.9,
    7: 0.95,
    8: 1,
    9: 0,
  };
  return table[stage.position] ?? 0.1;
}

export function isOpen(lead: LeadWithJoins): boolean {
  return !lead.stage?.is_won && !lead.stage?.is_lost;
}

export function isWon(lead: LeadWithJoins): boolean {
  return !!lead.stage?.is_won;
}

export function isLost(lead: LeadWithJoins): boolean {
  return !!lead.stage?.is_lost;
}

/** Sum helper with nullable number handling. */
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

const n = (v: number | null | undefined): number => Number(v ?? 0);

export interface OverviewMetrics {
  openCount: number;
  openTCV: number;
  openMRR: number;
  weightedPipeline: number;

  wonThisMonthCount: number;
  wonThisMonthTCV: number;
  wonThisMonthMRR: number;

  mrrOnBooks: number;

  winRate90d: number | null; // 0..1 or null if no closed deals
  avgDaysToClose: number | null;
  closedLast90Count: number;
}

export function computeOverview(leads: LeadWithJoins[]): OverviewMetrics {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const cutoff90 = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  const open = leads.filter(isOpen);
  const won = leads.filter(isWon);

  const wonThisMonth = won.filter((l) => {
    const closed = l.actual_close_date || l.updated_at;
    return closed && new Date(closed).getTime() >= startOfMonth;
  });

  const closedRecently = leads.filter((l) => {
    if (!isWon(l) && !isLost(l)) return false;
    const closed = l.actual_close_date || l.updated_at;
    return closed && new Date(closed).getTime() >= cutoff90;
  });
  const wonRecently = closedRecently.filter(isWon);

  const winRate90d =
    closedRecently.length > 0 ? wonRecently.length / closedRecently.length : null;

  const daysToClose: number[] = [];
  for (const l of wonRecently) {
    const closed = l.actual_close_date || l.updated_at;
    if (!closed) continue;
    const ms = new Date(closed).getTime() - new Date(l.created_at).getTime();
    if (ms > 0) daysToClose.push(ms / (1000 * 60 * 60 * 24));
  }
  const avgDaysToClose =
    daysToClose.length > 0 ? sum(daysToClose) / daysToClose.length : null;

  return {
    openCount: open.length,
    openTCV: sum(open.map((l) => n(l.total_contract_value))),
    openMRR: sum(open.map((l) => n(l.monthly_recurring_value))),
    weightedPipeline: sum(
      open.map((l) => n(l.total_contract_value) * stageProbability(l.stage))
    ),

    wonThisMonthCount: wonThisMonth.length,
    wonThisMonthTCV: sum(wonThisMonth.map((l) => n(l.total_contract_value))),
    wonThisMonthMRR: sum(wonThisMonth.map((l) => n(l.monthly_recurring_value))),

    mrrOnBooks: sum(won.map((l) => n(l.monthly_recurring_value))),

    winRate90d,
    avgDaysToClose,
    closedLast90Count: closedRecently.length,
  };
}

// -------------------- Funnel --------------------
export interface FunnelRow {
  stageId: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  tcv: number;
}

export function computeFunnel(
  leads: LeadWithJoins[],
  stages: PipelineStage[]
): FunnelRow[] {
  const byStage = new Map<string, LeadWithJoins[]>();
  for (const s of stages) byStage.set(s.id, []);
  for (const l of leads) {
    byStage.get(l.stage_id)?.push(l);
  }
  return stages.map((s) => {
    const list = byStage.get(s.id) ?? [];
    return {
      stageId: s.id,
      name: s.name,
      position: s.position,
      isWon: s.is_won,
      isLost: s.is_lost,
      count: list.length,
      tcv: sum(list.map((l) => n(l.total_contract_value))),
    };
  });
}

// -------------------- Deal-type mix --------------------
export interface MixRow {
  key: string;
  label: string;
  count: number;
  tcv: number;
}

export function computeDealTypeMix(leads: LeadWithJoins[]): MixRow[] {
  const byType = new Map<string, { count: number; tcv: number }>();
  for (const l of leads.filter(isOpen)) {
    const cur = byType.get(l.deal_type) ?? { count: 0, tcv: 0 };
    cur.count += 1;
    cur.tcv += n(l.total_contract_value);
    byType.set(l.deal_type, cur);
  }
  return Array.from(byType.entries()).map(([key, v]) => ({
    key,
    label: key,
    count: v.count,
    tcv: v.tcv,
  }));
}

// -------------------- Source breakdown --------------------
export function computeSourceMix(leads: LeadWithJoins[]): MixRow[] {
  const bySource = new Map<string, { count: number; tcv: number }>();
  for (const l of leads) {
    const cur = bySource.get(l.source) ?? { count: 0, tcv: 0 };
    cur.count += 1;
    cur.tcv += n(l.total_contract_value);
    bySource.set(l.source, cur);
  }
  return Array.from(bySource.entries())
    .map(([key, v]) => ({ key, label: key, count: v.count, tcv: v.tcv }))
    .sort((a, b) => b.tcv - a.tcv);
}

// -------------------- Hot leads --------------------
export function computeHotLeads(
  leads: LeadWithJoins[],
  limit = 5
): LeadWithJoins[] {
  return leads
    .filter(isOpen)
    .slice()
    .sort(
      (a, b) =>
        n(b.total_contract_value) * stageProbability(b.stage) -
        n(a.total_contract_value) * stageProbability(a.stage)
    )
    .slice(0, limit);
}

export function daysInStage(lead: LeadWithJoins): number {
  const since = lead.stage_entered_at || lead.updated_at;
  if (!since) return 0;
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
