"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { setWarmupStart } from "@/lib/outbound/actions";

export function WarmupInput({ mailboxId, value }: { mailboxId: string; value: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <Input
        type="date"
        defaultValue={value ?? ""}
        disabled={pending}
        max={new Date().toISOString().slice(0, 10)}
        className="h-8 w-40 text-xs"
        onChange={(e) => {
          const v = e.target.value || null;
          start(async () => {
            setError(undefined);
            const res = await setWarmupStart(mailboxId, v);
            if (!res.ok) setError(res.error);
            router.refresh();
          });
        }}
      />
      {error && <p className="text-xs text-crimson-300">{error}</p>}
    </div>
  );
}
