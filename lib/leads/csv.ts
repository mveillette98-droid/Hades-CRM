import type { LeadWithJoins } from "./queries";
import { DEAL_TYPE_LABEL, LEAD_SOURCE_LABEL } from "./labels";

const COLUMNS = [
  "Company",
  "Contact",
  "Email",
  "Phone",
  "Deal Type",
  "Stage",
  "Source",
  "One-time Value",
  "MRR",
  "TCV",
  "Assignee",
  "Created At",
  "Days in Stage",
] as const;

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Always quote + escape embedded quotes. Defends against commas, newlines, leading =/+/-/@ (CSV injection).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function daysSince(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  return String(Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24))));
}

export function leadsToCsv(leads: LeadWithJoins[]): string {
  const header = COLUMNS.map(esc).join(",");
  const rows = leads.map((l) =>
    [
      l.company_name,
      l.contact_name,
      l.email ?? "",
      l.phone ?? "",
      DEAL_TYPE_LABEL[l.deal_type] ?? l.deal_type,
      l.stage?.name ?? "",
      LEAD_SOURCE_LABEL[l.source] ?? l.source,
      Number(l.one_time_value ?? 0),
      Number(l.monthly_recurring_value ?? 0),
      Number(l.total_contract_value ?? 0),
      l.assignee?.full_name || l.assignee?.email || "",
      l.created_at,
      daysSince(l.stage_entered_at ?? l.updated_at),
    ]
      .map(esc)
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  // Prepend BOM so Excel respects UTF-8
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
