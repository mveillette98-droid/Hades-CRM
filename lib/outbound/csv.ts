/**
 * Lead import. Takes a CSV straight out of Apollo, Clay, Sales Nav exports
 * or a Google Sheet and maps the usual column names onto ours. Anything
 * else becomes a custom field you can use as {{column_name}}.
 */
export interface ParsedLead {
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  personal_line: string | null;
  fields: Record<string, string>;
}

const ALIASES: Record<string, keyof Omit<ParsedLead, "fields">> = {
  email: "email",
  e_mail: "email",
  email_address: "email",
  work_email: "email",
  business_email: "email",
  first_name: "first_name",
  firstname: "first_name",
  first: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  last: "last_name",
  company: "company",
  company_name: "company",
  companyname: "company",
  organization: "company",
  organization_name: "company",
  account_name: "company",
  firm: "company",
  title: "title",
  job_title: "title",
  position: "title",
  personal_line: "personal_line",
  personalization: "personal_line",
  personalized_line: "personal_line",
  first_line: "personal_line",
  icebreaker: "personal_line",
  opener: "personal_line",
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function snake(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", "\t", ";"].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseLeads(input: string): {
  leads: ParsedLead[];
  invalid: number;
  columns: string[];
  error?: string;
} {
  const rows = parseCsv(input);
  if (rows.length < 2) return { leads: [], invalid: 0, columns: [], error: "Paste a header row plus at least one lead." };
  const header = rows[0].map(snake);
  const emailCol = header.findIndex((h) => ALIASES[h] === "email");
  if (emailCol < 0) return { leads: [], invalid: 0, columns: header, error: "No email column found." };

  const seen = new Set<string>();
  const leads: ParsedLead[] = [];
  let invalid = 0;
  for (const r of rows.slice(1)) {
    const lead: ParsedLead = {
      email: "",
      first_name: null,
      last_name: null,
      company: null,
      title: null,
      personal_line: null,
      fields: {},
    };
    header.forEach((h, i) => {
      const v = (r[i] ?? "").trim();
      if (!v || !h) return;
      const known = ALIASES[h];
      if (known === "email") lead.email = v.toLowerCase();
      else if (known) lead[known] = v;
      else lead.fields[h] = v;
    });
    // "Full name" only: split it.
    const fullName = lead.fields.name ?? lead.fields.full_name ?? lead.fields.contact_name;
    if (!lead.first_name && fullName) {
      const [first, ...rest] = fullName.split(/\s+/);
      lead.first_name = first || null;
      lead.last_name = rest.join(" ") || lead.last_name;
    }
    if (!EMAIL_RE.test(lead.email) || seen.has(lead.email)) {
      invalid++;
      continue;
    }
    seen.add(lead.email);
    leads.push(lead);
  }
  return { leads, invalid, columns: header };
}
