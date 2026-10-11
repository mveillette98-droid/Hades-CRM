"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCampaign, setCampaignStatus } from "@/lib/outbound/actions";
import type { CampaignStatus } from "@/lib/supabase/types";

export function CampaignControls({
  id,
  status,
  canDelete,
}: {
  id: string;
  status: CampaignStatus;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const set = (s: "active" | "paused") =>
    start(async () => {
      setError(undefined);
      const res = await setCampaignStatus(id, s);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "active" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => set("paused")}>
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
        ) : (
          <Button size="sm" variant="gold" disabled={pending} onClick={() => set("active")}>
            <Play className="h-3.5 w-3.5" />
            {status === "draft" ? "Start sending" : status === "completed" ? "Reopen" : "Resume"}
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              confirm("Delete this campaign, its leads and its email history?") &&
              start(async () => {
                const res = await deleteCampaign(id);
                if (!res.ok) return setError(res.error);
                router.push("/outbound");
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-crimson-300">{error}</p>}
    </div>
  );
}
