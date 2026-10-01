"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suppressAddress } from "@/lib/outbound/actions";

export function SuppressForm() {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="email@firm.com or firm.com" className="h-9" />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !value.trim()}
          onClick={() =>
            start(async () => {
              const res = await suppressAddress(value);
              setMsg(res.ok ? { ok: true, text: `${value.trim()} won't be emailed.` } : { ok: false, text: res.error });
              if (res.ok) setValue("");
            })
          }
        >
          Block
        </Button>
      </div>
      {msg && <p className={msg.ok ? "text-xs text-gold-300" : "text-xs text-crimson-300"}>{msg.text}</p>}
    </div>
  );
}
