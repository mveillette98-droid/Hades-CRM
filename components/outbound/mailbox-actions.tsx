"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, PlugZap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMailbox, setMailboxStatus, testMailbox } from "@/lib/outbound/actions";
import type { MailboxStatus } from "@/lib/supabase/types";

export function MailboxActions({
  id,
  email,
  status,
  canDelete,
}: {
  id: string;
  email: string;
  status: MailboxStatus;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: { message: string } }>) =>
    start(async () => {
      setResult(undefined);
      const res = await fn();
      if (!res.ok) setResult({ ok: false, text: res.error ?? "Failed." });
      else if (res.data?.message) setResult({ ok: true, text: res.data.message });
      router.refresh();
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => testMailbox(id))}>
          <PlugZap className="h-3.5 w-3.5" />
          {pending ? "Working…" : "Test"}
        </Button>
        {status === "paused" ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => setMailboxStatus(id, "active"))}>
            <Play className="h-3.5 w-3.5" />
            Resume
          </Button>
        ) : status === "active" ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => run(() => setMailboxStatus(id, "paused"))}>
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
        ) : null}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs hover:text-crimson-400"
            disabled={pending}
            onClick={() => {
              if (confirm(`Remove ${email}? Campaigns using it will stop sending from it.`)) run(() => deleteMailbox(id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {result && (
        <p className={result.ok ? "text-xs text-gold-300" : "text-xs text-crimson-300"}>{result.text}</p>
      )}
    </div>
  );
}
