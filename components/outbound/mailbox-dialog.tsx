"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveMailbox } from "@/lib/outbound/actions";
import type { Mailbox } from "@/lib/supabase/types";
import { Field, Notice, nativeSelect } from "./bits";

const PRESETS = {
  google: { label: "Google Workspace", smtp_host: "smtp.gmail.com", smtp_port: 465, imap_host: "imap.gmail.com", imap_port: 993 },
  microsoft: { label: "Microsoft 365", smtp_host: "smtp.office365.com", smtp_port: 587, imap_host: "outlook.office365.com", imap_port: 993 },
  zoho: { label: "Zoho", smtp_host: "smtp.zoho.com", smtp_port: 465, imap_host: "imap.zoho.com", imap_port: 993 },
  custom: { label: "Other SMTP / IMAP", smtp_host: "", smtp_port: 465, imap_host: "", imap_port: 993 },
} as const;
type PresetKey = keyof typeof PRESETS;

function presetFor(m?: Mailbox): PresetKey {
  if (!m) return "google";
  const hit = (Object.keys(PRESETS) as PresetKey[]).find((k) => PRESETS[k].smtp_host === m.smtp_host);
  return hit ?? "custom";
}

export function MailboxDialog({
  mailbox,
  clients,
}: {
  mailbox?: Mailbox;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState<PresetKey>(presetFor(mailbox));
  const p = PRESETS[preset];

  function onSubmit(formData: FormData) {
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const res = await saveMailbox(mailbox?.id ?? null, formData);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mailbox ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add mailbox
          </Button>
        )}
      </DialogTrigger>
      <DialogContent side="right" className="flex h-full max-w-lg flex-col gap-0 p-0">
        <DialogHeader>
          <DialogTitle>{mailbox ? mailbox.email : "Add a sending mailbox"}</DialogTitle>
          <DialogDescription>
            Use an inbox on a separate sending domain, never the client&rsquo;s main domain. For
            Google, turn on 2-step verification and create an app password.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!mailbox && (
            <Field label="Provider">
              <select
                className={nativeSelect}
                value={preset}
                onChange={(e) => setPreset(e.target.value as PresetKey)}
              >
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <option key={k} value={k}>
                    {PRESETS[k].label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email *" error={fieldErrors.email}>
              <Input name="email" type="email" defaultValue={mailbox?.email} placeholder="matt@trycadencegtm.com" required />
            </Field>
            <Field label="Sender name *" error={fieldErrors.from_name}>
              <Input name="from_name" defaultValue={mailbox?.from_name} placeholder="Matt Veillette" required />
            </Field>
          </div>

          <Field
            label={mailbox ? "App password (leave blank to keep)" : "App password *"}
            hint="Stored encrypted. Not your normal login password."
            error={fieldErrors.password}
          >
            <Input name="password" type="password" autoComplete="new-password" placeholder="xxxx xxxx xxxx xxxx" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Daily limit" hint="Start at 20 to 30 a day per inbox." error={fieldErrors.daily_limit}>
              <Input name="daily_limit" inputMode="numeric" defaultValue={mailbox?.daily_limit ?? 30} />
            </Field>
            <Field label="Seconds between sends" hint="300 is safe. Jitter is added." error={fieldErrors.min_gap_seconds}>
              <Input name="min_gap_seconds" inputMode="numeric" defaultValue={mailbox?.min_gap_seconds ?? 300} />
            </Field>
          </div>

          <Field label="Signature" hint="Plain text. Goes under every email. Merge tags work.">
            <Textarea name="signature" rows={3} defaultValue={mailbox?.signature ?? ""} placeholder={"Matt\nCadence GTM"} />
          </Field>

          <Field label="Client (optional)" hint="Whose domain this inbox sends for.">
            <select name="client_id" className={nativeSelect} defaultValue={mailbox?.client_id ?? ""}>
              <option value="">Cadence (house)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <details className="rounded-md border border-ink-700 px-3 py-2" open={preset === "custom"}>
            <summary className="cursor-pointer text-xs text-muted-foreground">Server settings</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Login username" hint="Blank uses the email.">
                <Input name="username" defaultValue={mailbox?.username ?? ""} />
              </Field>
              <div />
              <Field label="SMTP host" error={fieldErrors.smtp_host}>
                <Input key={`sh-${preset}`} name="smtp_host" defaultValue={mailbox?.smtp_host ?? p.smtp_host} />
              </Field>
              <Field label="SMTP port">
                <Input key={`sp-${preset}`} name="smtp_port" inputMode="numeric" defaultValue={mailbox?.smtp_port ?? p.smtp_port} />
              </Field>
              <Field label="IMAP host" hint="For reading replies.">
                <Input key={`ih-${preset}`} name="imap_host" defaultValue={mailbox?.imap_host ?? p.imap_host} />
              </Field>
              <Field label="IMAP port">
                <Input key={`ip-${preset}`} name="imap_port" inputMode="numeric" defaultValue={mailbox?.imap_port ?? p.imap_port} />
              </Field>
            </div>
          </details>

          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save mailbox"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
