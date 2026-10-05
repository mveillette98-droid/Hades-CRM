"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCampaignFromRun } from "@/lib/outbound/actions";

/** Turns one written sequence into a draft campaign in the sender. */
export function CreateCampaignButton({ runId, sequenceIndex }: { runId: string; sequenceIndex: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-gold-300"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await createCampaignFromRun(runId, sequenceIndex);
            if (!res.ok) return setError(res.error);
            router.push(`/outbound/${res.data!.id}`);
          })
        }
      >
        <Send className="h-3.5 w-3.5" />
        {pending ? "Creating…" : "Send with Cadence"}
      </Button>
      {error && <span className="text-xs text-crimson-300">{error}</span>}
    </>
  );
}
