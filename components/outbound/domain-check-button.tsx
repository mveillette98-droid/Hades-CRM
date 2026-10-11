"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkSendingDomains } from "@/lib/outbound/actions";

export function DomainCheckButton({ domain, label }: { domain?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={domain ? "ghost" : "outline"}
        className={domain ? "h-7 px-2 text-xs" : undefined}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(undefined);
            const res = await checkSendingDomains(domain);
            if (!res.ok) setMsg({ ok: false, text: res.error });
            else if (!domain)
              setMsg({
                ok: res.data!.failing === 0,
                text: res.data!.failing === 0 ? `All ${res.data!.checked} domains pass.` : `${res.data!.failing} of ${res.data!.checked} need fixing.`,
              });
            router.refresh();
          })
        }
      >
        <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {pending ? "Checking…" : label ?? "Check all domains"}
      </Button>
      {msg && <p className={msg.ok ? "text-xs text-gold-300" : "text-xs text-crimson-300"}>{msg.text}</p>}
    </div>
  );
}
