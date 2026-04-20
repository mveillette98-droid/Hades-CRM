"use client";

import { useMemo, useState, useTransition } from "react";
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
import { DEAL_TYPES, LEAD_SOURCES, dealEmphasis } from "@/lib/leads/labels";
import { createLead, updateLead } from "@/lib/leads/actions";
import { formatCompactCurrency, cn, totalContractValue } from "@/lib/utils";
import type { DealType, Lead, LeadSource, PipelineStage, Profile } from "@/lib/supabase/types";

interface LeadFormProps {
  mode: "create" | "edit";
  lead?: Lead;
  stages: PipelineStage[];
  team: Pick<Profile, "id" | "full_name" | "email">[];
  onDone?: () => void;
}

export function LeadForm({ mode, lead, stages, team, onDone }: LeadFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled state for smart defaults + live TCV calc
  const [dealType, setDealType] = useState<DealType>(
    lead?.deal_type ?? "website_build"
  );
  const [source, setSource] = useState<LeadSource>(lead?.source ?? "cold_outreach");
  const [stageId, setStageId] = useState<string>(
    lead?.stage_id ?? stages[0]?.id ?? ""
  );
  const [assignee, setAssignee] = useState<string>(
    lead?.assigned_to ?? ""
  );
  const [oneTime, setOneTime] = useState<string>(
    lead?.one_time_value ? String(lead.one_time_value) : ""
  );
  const [mrr, setMrr] = useState<string>(
    lead?.monthly_recurring_value ? String(lead.monthly_recurring_value) : ""
  );

  const tcv = useMemo(() => {
    const o = Number.parseFloat(oneTime || "0") || 0;
    const m = Number.parseFloat(mrr || "0") || 0;
    return totalContractValue(o, m);
  }, [oneTime, mrr]);

  const emphasis = dealEmphasis(dealType);

  async function onSubmit(formData: FormData) {
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createLead(formData)
          : await updateLead(lead!.id, formData);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.refresh();
      onDone?.();
    });
  }

  const err = (k: string) => fieldErrors[k];

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {/* Contact + company */}
      <Section title="Who" accent="crimson">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact name *" error={err("contact_name")}>
            <Input
              name="contact_name"
              defaultValue={lead?.contact_name}
              placeholder="Taylor Ortiz"
              required
            />
          </Field>
          <Field label="Company *" error={err("company_name")}>
            <Input
              name="company_name"
              defaultValue={lead?.company_name}
              placeholder="Blackriver Roofing"
              required
            />
          </Field>
          <Field label="Phone" error={err("phone")}>
            <Input
              name="phone"
              defaultValue={lead?.phone ?? ""}
              placeholder="+1 (555) 123-4567"
              type="tel"
            />
          </Field>
          <Field label="Email" error={err("email")}>
            <Input
              name="email"
              defaultValue={lead?.email ?? ""}
              placeholder="taylor@blackriver.com"
              type="email"
            />
          </Field>
          <Field label="Current website" error={err("website_url")} className="sm:col-span-2">
            <Input
              name="website_url"
              defaultValue={lead?.website_url ?? ""}
              placeholder="https://blackriver.com"
            />
          </Field>
        </div>
      </Section>

      {/* Deal type + values */}
      <Section title="Deal" accent="crimson">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Deal type *">
            <Select
              name="deal_type"
              value={dealType}
              onValueChange={(v) => setDealType(v as DealType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {DEAL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Source *">
            <Select
              name="source"
              value={source}
              onValueChange={(v) => setSource(v as LeadSource)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Where'd it come from?" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="One-time project value"
            error={err("one_time_value")}
            emphasized={emphasis === "one_time" || emphasis === "both"}
            muted={emphasis === "mrr"}
            hint={
              emphasis === "mrr"
                ? "Retainer picked — MRR is the key number."
                : undefined
            }
          >
            <MoneyInput
              name="one_time_value"
              value={oneTime}
              onValueChange={setOneTime}
              emphasis={emphasis === "one_time" || emphasis === "both"}
            />
          </Field>

          <Field
            label="Monthly recurring (MRR)"
            error={err("monthly_recurring_value")}
            emphasized={emphasis === "mrr" || emphasis === "both"}
            muted={emphasis === "one_time"}
            hint={
              emphasis === "one_time"
                ? "Website build picked — usually 0 unless you host it."
                : undefined
            }
          >
            <MoneyInput
              name="monthly_recurring_value"
              value={mrr}
              onValueChange={setMrr}
              emphasis={emphasis === "mrr" || emphasis === "both"}
            />
          </Field>

          {/* Live TCV */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between rounded-md border border-gold-700/40 bg-gold-900/10 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">
                  Total contract value
                </p>
                <p className="text-xs text-muted-foreground">
                  One-time + (MRR × 12). Auto-calculated.
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-gold-300">
                {formatCompactCurrency(tcv)}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Stage + ownership + dates */}
      <Section title="Pipeline" accent="crimson">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Stage *" error={err("stage_id")}>
            <Select name="stage_id" value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Assigned to">
            <Select
              name="assigned_to"
              value={assignee}
              onValueChange={setAssignee}
            >
              <SelectTrigger>
                <SelectValue placeholder="You" />
              </SelectTrigger>
              <SelectContent>
                {team.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Next follow-up">
            <Input
              name="next_followup_date"
              type="date"
              defaultValue={lead?.next_followup_date ?? ""}
            />
          </Field>
          <Field label="Proposal sent">
            <Input
              name="proposal_sent_date"
              type="date"
              defaultValue={lead?.proposal_sent_date ?? ""}
            />
          </Field>
          <Field label="Expected close">
            <Input
              name="expected_close_date"
              type="date"
              defaultValue={lead?.expected_close_date ?? ""}
            />
          </Field>
          <Field label="Actual close">
            <Input
              name="actual_close_date"
              type="date"
              defaultValue={lead?.actual_close_date ?? ""}
            />
          </Field>
        </div>
      </Section>

      {/* Scope notes */}
      <Section title="Scope" accent="crimson">
        <Field label="What they need built">
          <Textarea
            name="scope_notes"
            defaultValue={lead?.scope_notes ?? ""}
            rows={4}
            placeholder="5-page Next.js build, Stripe checkout, CMS-driven blog, target ship date end of May…"
          />
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
          {pending ? "Saving…" : mode === "create" ? "Create lead" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Sub-components ----------

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
        <span
          className={cn(
            "h-px w-6",
            accent === "gold" ? "bg-gold-500/70" : "bg-crimson-500/70"
          )}
        />
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
  emphasized,
  muted,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  emphasized?: boolean;
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", muted && "opacity-70", className)}>
      <Label
        className={cn(
          emphasized && "text-crimson-400",
          error && "text-crimson-400"
        )}
      >
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-crimson-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function MoneyInput({
  name,
  value,
  onValueChange,
  emphasis,
}: {
  name: string;
  value: string;
  onValueChange: (v: string) => void;
  emphasis?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(e) => onValueChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0"
        className={cn(
          "pl-7",
          emphasis &&
            "border-crimson-600/50 shadow-[0_0_0_1px_rgba(220,38,38,0.25)]"
        )}
      />
    </div>
  );
}
