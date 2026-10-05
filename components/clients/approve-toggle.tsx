"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setRunApproved } from "@/lib/clients/actions";

export function ApproveToggle({
  runId,
  clientId,
  approved,
}: {
  runId: string;
  clientId: string;
  approved: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={approved ? "gold" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setRunApproved(runId, clientId, !approved);
          router.refresh();
        })
      }
    >
      {approved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {approved ? "Approved" : "Approve"}
    </Button>
  );
}
