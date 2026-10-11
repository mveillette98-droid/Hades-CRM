"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteLead, setLeadPaused } from "@/lib/outbound/actions";
import type { OutboundLeadStatus } from "@/lib/supabase/types";

export function LeadActions({
  id,
  campaignId,
  status,
}: {
  id: string;
  campaignId: string;
  status: OutboundLeadStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-1">
      {(status === "queued" || status === "active") && (
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Pause" disabled={pending} onClick={() => go(() => setLeadPaused(id, campaignId, true))}>
          <Pause className="h-3.5 w-3.5" />
        </Button>
      )}
      {status === "paused" && (
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Resume" disabled={pending} onClick={() => go(() => setLeadPaused(id, campaignId, false))}>
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 hover:text-crimson-400"
        title="Remove"
        disabled={pending}
        onClick={() => confirm("Remove this lead from the campaign?") && go(() => deleteLead(id, campaignId))}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
