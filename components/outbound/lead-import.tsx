"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importLeads, type ImportSummary } from "@/lib/outbound/actions";
import { Notice } from "./bits";

export function LeadImport({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<ImportSummary>();

  return (
    <div className="space-y-3">
      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={5}
        placeholder={"email,first_name,company,title,personal_line\njane@whitfieldcpa.com,Jane,Whitfield CPAs,Managing Partner,Saw you just opened a second office in Austin."}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,.tsv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
            e.target.value = "";
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Choose CSV
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !csv.trim()}
          onClick={() =>
            start(async () => {
              setError(undefined);
              setSummary(undefined);
              const res = await importLeads(campaignId, csv);
              if (!res.ok) return setError(res.error);
              setSummary(res.data);
              setCsv("");
              router.refresh();
            })
          }
        >
          {pending ? "Importing…" : "Import leads"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Needs an email column. Apollo, Clay and Sheets exports work as is.
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {summary && (
        <Notice tone="ok">
          Added {summary.added}.
          {summary.alreadyContacted > 0 && ` Skipped ${summary.alreadyContacted} already in another campaign for this client.`}
          {summary.suppressed > 0 && ` Skipped ${summary.suppressed} on the suppression list.`}
          {summary.invalid > 0 && ` Skipped ${summary.invalid} with a bad or duplicate email.`}
        </Notice>
      )}
    </div>
  );
}
