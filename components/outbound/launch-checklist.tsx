"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistItem } from "@/lib/outbound/readiness";
import { setCampaignSignoff } from "@/lib/outbound/actions";
import { StatusIcon } from "./status-icon";

const SIGNOFF: Record<string, { key: "copy_approved_at" | "list_verified_at"; label: string }> = {
  copy: { key: "copy_approved_at", label: "I've read every email" },
  verified: { key: "list_verified_at", label: "List is verified" },
};

export function LaunchChecklist({
  campaignId,
  items,
  canStart,
}: {
  campaignId: string;
  items: ChecklistItem[];
  canStart: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blocking = items.filter((i) => i.status === "fail").length;

  return (
    <div className="space-y-3">
      <p className={canStart ? "text-sm text-gold-200" : "text-sm text-muted-foreground"}>
        {canStart ? "Ready to send." : `${blocking} ${blocking === 1 ? "thing" : "things"} to fix before this can start.`}
      </p>
      <ul className="space-y-3">
        {items.map((i) => {
          const sign = SIGNOFF[i.key];
          return (
            <li key={i.key} className="flex gap-2.5">
              <StatusIcon status={i.status} />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium leading-tight">{i.label}</p>
                <p className="text-xs text-muted-foreground">{i.detail}</p>
                {sign && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-crimson-600"
                      checked={i.status === "pass"}
                      disabled={pending}
                      onChange={(e) =>
                        start(async () => {
                          await setCampaignSignoff(campaignId, sign.key, e.target.checked);
                          router.refresh();
                        })
                      }
                    />
                    {sign.label}
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
