"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaignSteps } from "@/lib/outbound/actions";
import type { CampaignStep } from "@/lib/supabase/types";
import { Notice } from "./bits";

const TAGS = ["{{first_name}}", "{{company}}", "{{title}}", "{{personal_line}}", "{{sender_first_name}}"];

export function StepsEditor({
  campaignId,
  initial,
  threaded,
  locked,
}: {
  campaignId: string;
  initial: CampaignStep[];
  threaded: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<CampaignStep[]>(initial.length ? initial : [{ step: 1, day: 1, subject: "", body: "" }]);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const [dirty, setDirty] = useState(false);

  const update = (i: number, patch: Partial<CampaignStep>) => {
    setDirty(true);
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  return (
    <div className="space-y-4">
      {locked && (
        <Notice tone="warn">
          This campaign is sending. Edits apply to emails that haven&rsquo;t gone out yet.
        </Notice>
      )}
      {steps.map((s, i) => (
        <div key={i} className="rounded-md border border-ink-700 bg-ink-900">
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Email {i + 1}</p>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Day
              <Input
                type="number"
                min={1}
                max={90}
                value={s.day}
                onChange={(e) => update(i, { day: Number(e.target.value) || 1 })}
                className="h-7 w-16 px-2 text-xs"
              />
            </label>
            {steps.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs hover:text-crimson-400"
                onClick={() => {
                  setDirty(true);
                  setSteps((x) => x.filter((_, j) => j !== i));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="space-y-2 p-4">
            {i > 0 && threaded ? (
              <p className="text-xs text-muted-foreground">Subject: Re: (email 1 subject)</p>
            ) : (
              <Input
                value={s.subject}
                onChange={(e) => update(i, { subject: e.target.value })}
                placeholder="Subject"
                className="h-9"
              />
            )}
            <Textarea
              value={s.body}
              onChange={(e) => update(i, { body: e.target.value })}
              rows={8}
              className="font-mono text-[13px] leading-relaxed"
            />
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Merge tags: {TAGS.join(" ")} and any CSV column as {"{{column_name}}"}. Fallback:{" "}
        {"{{first_name|there}}"}. A lead missing a tag with no fallback is held back, not sent.
      </p>

      {result && <Notice tone={result.ok ? "ok" : "error"}>{result.text}</Notice>}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={steps.length >= 10}
          onClick={() => {
            setDirty(true);
            setSteps((s) => [
              ...s,
              { step: s.length + 1, day: (s[s.length - 1]?.day ?? 1) + 3, subject: "", body: "" },
            ]);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add follow-up
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              setResult(undefined);
              const res = await updateCampaignSteps(
                campaignId,
                steps.map((s, i) => ({ ...s, step: i + 1 }))
              );
              setResult(res.ok ? { ok: true, text: "Emails saved." } : { ok: false, text: res.error });
              if (res.ok) setDirty(false);
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save emails"}
        </Button>
      </div>
    </div>
  );
}
