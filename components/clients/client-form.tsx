"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VERTICALS } from "@/lib/leads/labels";
import { BRIEF_FIELDS, CLIENT_STATUSES } from "@/lib/clients/labels";
import { createClientProfile, updateClientProfile } from "@/lib/clients/actions";
import { cn } from "@/lib/utils";
import type { Client, ClientStatus } from "@/lib/supabase/types";

export type ClientPrefill = Partial<
  Pick<Client, "name" | "vertical" | "website_url" | "monthly_retainer" | "notes" | "lead_id">
>;

interface ClientFormProps {
  mode: "create" | "edit";
  client?: Client;
  prefill?: ClientPrefill;
  onDone?: () => void;
}

export function ClientForm({ mode, client, prefill, onDone }: ClientFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? "onboarding");

  const initial = client ?? prefill;

  function onSubmit(formData: FormData) {
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createClientProfile(formData)
          : await updateClientProfile(client!.id, formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onDone?.();
      if (mode === "create" && result.data && "id" in result.data) {
        router.push(`/clients/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  const err = (k: string) => fieldErrors[k];

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {prefill?.lead_id && <input type="hidden" name="lead_id" value={prefill.lead_id} />}

      <Section title="Firm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Firm name *" error={err("name")}>
            <Input
              name="name"
              defaultValue={initial?.name ?? ""}
              placeholder="Whitfield & Co. CPAs"
              required
            />
          </Field>
          <Field label="Vertical *" error={err("vertical")}>
            <Input
              name="vertical"
              defaultValue={initial?.vertical ?? "Accounting / CAS"}
              list="cadence-client-verticals"
              required
            />
            <datalist id="cadence-client-verticals">
              {VERTICALS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="Website" error={err("website_url")}>
            <Input
              name="website_url"
              defaultValue={initial?.website_url ?? ""}
              placeholder="https://whitfieldcpa.com"
            />
          </Field>
          <Field label="Status">
            <Select name="status" value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Monthly retainer" error={err("monthly_retainer")}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                name="monthly_retainer"
                inputMode="decimal"
                defaultValue={initial?.monthly_retainer ? String(initial.monthly_retainer) : ""}
                placeholder="3000"
                className="pl-7"
              />
            </div>
          </Field>
        </div>
      </Section>

      <Section title="The brief" accent="gold">
        <p className="-mt-1 text-xs text-muted-foreground">
          Every agent reads this. The sharper it is, the less generic the output.
        </p>
        {BRIEF_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} error={err(f.key)}>
            <Textarea
              name={f.key}
              defaultValue={client?.[f.key] ?? ""}
              rows={3}
            />
          </Field>
        ))}
      </Section>

      <Section title="Notes">
        <Field label="Anything else">
          <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={3} />
        </Field>
      </Section>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-crimson-800/60 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-300"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create client" : "Save brief"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: "crimson" | "gold";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        <span className={cn("h-px w-6", accent === "gold" ? "bg-gold-500/70" : "bg-crimson-500/70")} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className={cn(error && "text-crimson-400")}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-crimson-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
