import type { LeadWithJoins } from "@/lib/leads/queries";
import type { LeadSource } from "@/lib/supabase/types";
import { LEAD_SOURCES, LEAD_SOURCE_LABEL } from "@/lib/leads/labels";
import {
  isOpen,
  isWon,
  isLost,
  stageProbability,
} from "@/lib/dashboard/metrics";

// Brand-consistent palette for per-source color assignments.
// Crimson is reserved for hero metrics; sources get a cool-to-warm spread.
export const SOURCE_COLORS: Record<LeadSource, string> = {
  instagram_hb: "#dc2626",   // crimson — the flagship brand channel
  tiktok: "#f43f5e",         // rose
  cold_outreach: "#fbbf24",  // gold
  referral: "#10b981",       // emerald
  network: "#3b82f6",        // blue
  website_form: "#a855f7",   // purple
  other: "#94a3b8",          // slate
};

const n = (v: number | null | undefined): number => Number(v ?? 0);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

/** Returns the last `count` month keys ending at the current month (inclusive), oldest first. */
export function lastNMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export interface MonthlyPoint {
  month: string;          // YYYY-MM
  label: string;          // "Mar"
  count: number;
  openTCV: number;
  wonTCV: number;
}

export interface SourceMetrics {
  key: LeadSource;
  label: string;
  color: string;

  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  lostLeads: number;
  closedLeads: number;

  openTCV: number;
  wonTCV: number;           // all time
  wonTCV90d: number;
  weightedPipeline: number;

  winRate: number | null;       // won / (won + lost)
  avgDealSize: number | null;   // won deals only
  avgDaysToClose: number | null;

  firstLeadAt: string | null;
  lastLeadAt: string | null;
  leadsThisMonth: number;
  leadsPrevMonth: number;

  monthly: MonthlyPoint[]; // last 12 months, oldest first
}

export interface SourceOverview {
  activeSources: number;          // sources with ≥1 lead this quarter
  totalSources: number;
  topRevenueSource: SourceMetrics | null;
  topVolumeSource: SourceMetrics | null;
  bestWinRateSource: SourceMetrics | null;
  wonTCVAllSources: number;
  openTCVAllSources: number;
}

export function computeSourceMetrics(
  leads: LeadWithJoins[]
): SourceMetrics[] {
  const now = new Date();
  const cutoff90 = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const thisMonthKey = monthKey(now);
  const prevMonthKey = monthKey(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );
  const months12 = lastNMonths(12);

  const bySource = new Map<LeadSource, LeadWithJoins[]>();
  for (const src of LEAD_SOURCES) bySource.set(src.value, []);
  for (const lead of leads) {
    const bucket = bySource.get(lead.source as LeadSource);
    if (bucket) bucket.push(lead);
  }

  const out: SourceMetrics[] = [];
  for (const [key, list] of bySource.entries()) {
    const open = list.filter(isOpen);
    const won = list.filter(isWon);
    const lost = list.filter(isLost);
    const closed = won.length + lost.length;

    const openTCV = sum(open.map((l) => n(l.total_contract_value)));
    const wonTCV = sum(won.map((l) => n(l.total_contract_value)));
    const weightedPipeline = sum(
      open.map((l) => n(l.total_contract_value) * stageProbability(l.stage))
    );

    const wonRecent = won.filter((l) => {
      const closedAt = l.actual_close_date || l.updated_at;
      return closedAt && new Date(closedAt).getTime() >= cutoff90;
    });
    const wonTCV90d = sum(wonRecent.map((l) => n(l.total_contract_value)));

    const daysToClose: number[] = [];
    for (const l of won) {
      const closedAt = l.actual_close_date || l.updated_at;
      if (!closedAt) continue;
      const ms =
        new Date(closedAt).getTime() - new Date(l.created_at).getTime();
      if (ms > 0) daysToClose.push(ms / (1000 * 60 * 60 * 24));
    }

    const sorted = list
      .map((l) => new Date(l.created_at).getTime())
      .sort((a, b) => a - b);

    // Monthly breakdown (last 12 months).
    const monthly: MonthlyPoint[] = months12.map((mk) => ({
      month: mk,
      label: monthLabel(mk),
      count: 0,
      openTCV: 0,
      wonTCV: 0,
    }));
    const monthlyIndex = new Map(monthly.map((p, i) => [p.month, i]));
    for (const l of list) {
      const created = new Date(l.created_at);
      const k = monthKey(created);
      const idx = monthlyIndex.get(k);
      if (idx === undefined) continue;
      monthly[idx].count += 1;
      if (isOpen(l)) monthly[idx].openTCV += n(l.total_contract_value);
    }
    for (const l of won) {
      const closedAt = l.actual_close_date || l.updated_at;
      if (!closedAt) continue;
      const k = monthKey(new Date(closedAt));
      const idx = monthlyIndex.get(k);
      if (idx === undefined) continue;
      monthly[idx].wonTCV += n(l.total_contract_value);
    }

    out.push({
      key,
      label: LEAD_SOURCE_LABEL[key],
      color: SOURCE_COLORS[key],

      totalLeads: list.length,
      openLeads: open.length,
      wonLeads: won.length,
      lostLeads: lost.length,
      closedLeads: closed,

      openTCV,
      wonTCV,
      wonTCV90d,
      weightedPipeline,

      winRate: closed > 0 ? won.length / closed : null,
      avgDealSize: won.length > 0 ? wonTCV / won.length : null,
      avgDaysToClose:
        daysToClose.length > 0 ? sum(daysToClose) / daysToClose.length : null,

      firstLeadAt: sorted.length > 0 ? new Date(sorted[0]).toISOString() : null,
      lastLeadAt:
        sorted.length > 0
          ? new Date(sorted[sorted.length - 1]).toISOString()
          : null,
      leadsThisMonth: monthly.find((p) => p.month === thisMonthKey)?.count ?? 0,
      leadsPrevMonth: monthly.find((p) => p.month === prevMonthKey)?.count ?? 0,

      monthly,
    });
  }

  return out;
}

export function computeSourceOverview(rows: SourceMetrics[]): SourceOverview {
  const now = new Date();
  const startOfQuarter = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3,
    1
  ).getTime();

  const activeSources = rows.filter((r) => {
    if (!r.lastLeadAt) return false;
    return new Date(r.lastLeadAt).getTime() >= startOfQuarter;
  }).length;

  const withAnyActivity = rows.filter((r) => r.totalLeads > 0);

  const topRevenue = [...withAnyActivity].sort(
    (a, b) => b.wonTCV - a.wonTCV
  )[0];
  const topVolume = [...withAnyActivity].sort(
    (a, b) => b.totalLeads - a.totalLeads
  )[0];
  const bestWinRate = [...withAnyActivity]
    .filter((r) => r.winRate != null && r.closedLeads >= 2)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];

  return {
    activeSources,
    totalSources: LEAD_SOURCES.length,
    topRevenueSource: topRevenue ?? null,
    topVolumeSource: topVolume ?? null,
    bestWinRateSource: bestWinRate ?? null,
    wonTCVAllSources: sum(rows.map((r) => r.wonTCV)),
    openTCVAllSources: sum(rows.map((r) => r.openTCV)),
  };
}

/**
 * Pivoted monthly data for multi-line charts.
 * Returns one row per month with a numeric field per source key.
 */
export function pivotMonthlyByCount(
  rows: SourceMetrics[]
): Array<{ month: string; label: string } & Record<string, number | string>> {
  const months = lastNMonths(12);
  return months.map((m) => {
    const pt: Record<string, number | string> = {
      month: m,
      label: monthLabel(m),
    };
    for (const r of rows) {
      pt[r.key] = r.monthly.find((p) => p.month === m)?.count ?? 0;
    }
    return pt as { month: string; label: string } & Record<string, number>;
  });
}

export function pivotMonthlyByWonTCV(
  rows: SourceMetrics[]
): Array<{ month: string; label: string } & Record<string, number | string>> {
  const months = lastNMonths(12);
  return months.map((m) => {
    const pt: Record<string, number | string> = {
      month: m,
      label: monthLabel(m),
    };
    for (const r of rows) {
      pt[r.key] = r.monthly.find((p) => p.month === m)?.wonTCV ?? 0;
    }
    return pt as { month: string; label: string } & Record<string, number>;
  });
}
