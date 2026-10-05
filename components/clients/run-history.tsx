import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AGENT_LABEL } from "@/lib/clients/labels";
import type { RunState } from "@/lib/agents/pipelines";
import type { AgentRun } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export function RunHistory({
  runs,
  clientId,
  selectedId,
}: {
  runs: AgentRun[];
  clientId: string;
  selectedId: string | null;
}) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet. Start with research.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {runs.map((r) => {
        const state = (r.output ?? {}) as unknown as RunState;
        const score = state.rounds?.length ? state.final_score : undefined;
        return (
          <li key={r.id}>
            <Link
              href={`/clients/${clientId}?run=${r.id}`}
              scroll={false}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                r.id === selectedId
                  ? "border-crimson-700/60 bg-ink-850"
                  : "border-ink-700 bg-ink-900 hover:border-ink-600"
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{AGENT_LABEL[r.kind]}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  {r.status === "running" && r.step ? ` · ${r.step}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {score !== undefined && (
                  <span className={cn("font-mono text-xs", score >= 8 ? "text-gold-300" : "text-crimson-300")}>
                    {score}/10
                  </span>
                )}
                {r.approved && <Badge variant="won">Approved</Badge>}
                {r.status === "running" && <Badge variant="crimson">Running</Badge>}
                {r.status === "failed" && <Badge variant="lost">Stopped</Badge>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
