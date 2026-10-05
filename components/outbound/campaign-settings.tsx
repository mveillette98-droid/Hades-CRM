"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCampaignSettings } from "@/lib/outbound/actions";
import { DAY_NAMES, TIMEZONES } from "@/lib/outbound/labels";
import type { Campaign } from "@/lib/supabase/types";
import { Field, Notice, nativeSelect } from "./bits";

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hourLabel = (h: number) => (h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`);

export function CampaignSettings({
  campaign,
  mailboxes,
  selected,
}: {
  campaign: Campaign;
  mailboxes: { id: string; email: string; status: string; daily_limit: number }[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const tzs = TIMEZONES.includes(campaign.timezone) ? TIMEZONES : [campaign.timezone, ...TIMEZONES];

  return (
    <form
      action={(fd) =>
        start(async () => {
          setResult(undefined);
          const res = await updateCampaignSettings(campaign.id, fd);
          setResult(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
          router.refresh();
        })
      }
      className="space-y-4"
    >
      <Field label="Name">
        <Input name="name" defaultValue={campaign.name} required />
      </Field>

      <Field
        label="Send from"
        hint={
          mailboxes.length === 0
            ? "Add a mailbox on the Outbound page first."
            : "Leads are spread across these. Each thread stays on one inbox."
        }
      >
        <div className="space-y-1.5">
          {mailboxes.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="mailbox_ids"
                value={m.id}
                defaultChecked={selected.includes(m.id)}
                className="accent-crimson-600"
              />
              <span>{m.email}</span>
              <span className="text-xs text-muted-foreground">
                {m.daily_limit}/day{m.status !== "active" && ` · ${m.status}`}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Send days">
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="send_days"
                value={d}
                defaultChecked={campaign.send_days.includes(d)}
                className="accent-crimson-600"
              />
              {DAY_NAMES[d]}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <select name="window_start" className={nativeSelect} defaultValue={campaign.window_start}>
            {HOURS.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Until">
          <select name="window_end" className={nativeSelect} defaultValue={campaign.window_end}>
            {HOURS.slice(1).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Time zone" hint="The prospects' time zone, not yours.">
        <select name="timezone" className={nativeSelect} defaultValue={campaign.timezone}>
          {tzs.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="thread_followups"
          defaultChecked={campaign.thread_followups}
          className="mt-1 accent-crimson-600"
        />
        <span>
          Follow-ups reply in the same thread
          <span className="block text-xs text-muted-foreground">
            &ldquo;Re: first subject&rdquo;. Usually lands better than a new subject.
          </span>
        </span>
      </label>

      <Field label="Footer" hint="Optional. A mailing address or a one-line opt-out keeps you on the right side of CAN-SPAM.">
        <Textarea name="footer" rows={2} defaultValue={campaign.footer ?? ""} placeholder="Not the right person? Just reply and let me know." />
      </Field>

      {result && <Notice tone={result.ok ? "ok" : "error"}>{result.text}</Notice>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
