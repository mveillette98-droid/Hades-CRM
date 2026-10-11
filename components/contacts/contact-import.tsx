"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Notice } from "@/components/outbound/bits";
import { importContactsCsv } from "@/lib/contacts/actions";

export function ContactImport({ clientId }: { clientId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [listName, setListName] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  return (
    <div className="space-y-3">
      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={4}
        placeholder={"email,first_name,last_name,company,title,city,state,industry\njane@acmebuild.com,Jane,Doe,Acme Build,Owner,Austin,TX,Construction"}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap items-end gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,.tsv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              if (!listName) setListName(f.name.replace(/\.(csv|tsv|txt)$/i, ""));
            }
            e.target.value = "";
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Choose CSV
        </Button>
        <Field label="List name" className="w-56">
          <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="TX contractors, Oct" className="h-9" />
        </Field>
        <Button
          size="sm"
          disabled={pending || !csv.trim()}
          onClick={() =>
            start(async () => {
              setMsg(undefined);
              const res = await importContactsCsv(clientId, csv, listName);
              if (!res.ok) return setMsg({ ok: false, text: res.error });
              const d = res.data!;
              setMsg({
                ok: true,
                text: `Added ${d.added}.${d.duplicates ? ` ${d.duplicates} were already on the list.` : ""}${d.invalid ? ` ${d.invalid} had a bad or duplicate email.` : ""}`,
              });
              setCsv("");
              router.refresh();
            })
          }
        >
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
      {msg && <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
    </div>
  );
}
