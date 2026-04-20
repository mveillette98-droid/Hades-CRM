import Link from "next/link";
import { Flame } from "lucide-react";
import { StageBadge } from "@/components/leads/stage-badge";
import { DealTypeIcon } from "@/components/leads/deal-type-icon";
import { cn, formatCompactCurrency } from "@/lib/utils";
import { DEAL_TYPE_SHORT } from "@/lib/leads/labels";
import { daysInStage, stageProbability } from "@/lib/dashboard/metrics";
import type { LeadWithJoins } from "@/lib/leads/queries";

interface HotLeadsProps {
  leads: LeadWithJoins[];
}

export function HotLeads({ leads }: HotLeadsProps) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Flame className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No open leads yet. Log a call and get the board moving.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {leads.map((lead, i) => {
        const days = daysInStage(lead);
        const stale = days >= 7;
        const tcv = Number(lead.total_contract_value ?? 0);
        const weighted = tcv * stageProbability(lead.stage);
        return (
          <li key={lead.id}>
            <Link
              href={`/leads/${lead.id}`}
              className="group flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 transition-colors hover:border-crimson-800/60 hover:bg-ink-850"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-crimson-600/10 font-display text-xs font-bold text-crimson-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-crimson-400">
                    {lead.company_name}
                  </p>
                  <DealTypeIcon type={lead.deal_type} />
                  <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground md:inline">
                    {DEAL_TYPE_SHORT[lead.deal_type]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StageBadge stage={lead.stage} />
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      stale ? "text-crimson-400" : "text-muted-foreground"
                    )}
                  >
                    {stale ? "stale · " : ""}
                    {days === 0 ? "today" : `${days}d in stage`}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-sm font-bold text-gold-300">
                  {formatCompactCurrency(tcv)}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {formatCompactCurrency(weighted)} wtd
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
