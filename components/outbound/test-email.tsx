"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendTestEmail } from "@/lib/outbound/actions";
import { Notice, nativeSelect } from "./bits";

export function TestEmail({ campaignId, stepCount }: { campaignId: string; stepCount: number }) {
  const [to, setTo] = useState("");
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@gmail.com" className="h-9" />
        <select className={`${nativeSelect} h-9 w-24`} value={step} onChange={(e) => setStep(Number(e.target.value))}>
          {Array.from({ length: Math.max(1, stepCount) }, (_, i) => (
            <option key={i} value={i}>
              Email {i + 1}
            </option>
          ))}
        </select>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !to}
        onClick={() =>
          start(async () => {
            setResult(undefined);
            const res = await sendTestEmail(campaignId, to, step);
            setResult(res.ok ? { ok: true, text: res.data!.message } : { ok: false, text: res.error });
          })
        }
      >
        <Send className="h-3.5 w-3.5" />
        {pending ? "Sending…" : "Send test"}
      </Button>
      <p className="text-xs text-muted-foreground">Uses the first lead&rsquo;s data, or a sample lead if none are imported.</p>
      {result && <Notice tone={result.ok ? "ok" : "error"}>{result.text}</Notice>}
    </div>
  );
}
