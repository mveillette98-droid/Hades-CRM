"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice } from "@/components/outbound/bits";
import { searchApollo, saveApolloContacts, type ApolloSearchResult } from "@/lib/contacts/actions";
import { EMPLOYEE_RANGES } from "@/lib/contacts/apollo";

const split = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function ApolloSearch({
  clientId,
  defaults,
}: {
  clientId: string;
  defaults: { titles: string[]; locations: string[]; fromResearch: boolean };
}) {
  const router = useRouter();
  const [titles, setTitles] = useState(defaults.titles.join(", "));
  const [locations, setLocations] = useState(defaults.locations.join(", "));
  const [keywords, setKeywords] = useState("");
  const [ranges, setRanges] = useState<string[]>(["11,20", "21,50", "51,100"]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApolloSearchResult>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState(true);
  const [listName, setListName] = useState(`Apollo ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const run = (p: number) =>
    start(async () => {
      setMsg(undefined);
      const res = await searchApollo(clientId, {
        titles: split(titles),
        locations: split(locations),
        keywords: split(keywords),
        employeeRanges: ranges,
        page: p,
        perPage: 50,
      });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setPage(p);
      setResult(res.data);
      setPicked(new Set(res.data!.people.filter((x) => !x.saved).map((x) => x.apollo_id!)));
    });

  const save = () =>
    start(async () => {
      if (!result) return;
      setMsg(undefined);
      const chosen = result.people.filter((p) => picked.has(p.apollo_id!));
      const res = await saveApolloContacts(clientId, chosen, { reveal, listName });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      const d = res.data!;
      setMsg({
        ok: true,
        text: `Saved ${d.added}. ${d.withEmail} have an email.${d.duplicates ? ` ${d.duplicates} were already on the list.` : ""}`,
      });
      setResult({ ...result, people: result.people.map((p) => (picked.has(p.apollo_id!) ? { ...p, saved: true } : p)) });
      setPicked(new Set());
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Job titles"
          hint={defaults.fromResearch ? "Filled from the research agent's buyer titles. Comma separated." : "Comma separated, e.g. Owner, CEO, Founder"}
        >
          <Input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Owner, CEO, Founder" />
        </Field>
        <Field label="Locations" hint="Cities, states or countries. Comma separated.">
          <Input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Texas, United States" />
        </Field>
        <Field label="Company keywords" hint="Optional. Industry words, e.g. construction, dental, ecommerce.">
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="construction, contractors" />
        </Field>
        <Field label="Company size (employees)">
          <div className="flex flex-wrap gap-3 pt-2">
            {EMPLOYEE_RANGES.map((r) => (
              <label key={r.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-crimson-600"
                  checked={ranges.includes(r.value)}
                  onChange={(e) => setRanges((x) => (e.target.checked ? [...x, r.value] : x.filter((v) => v !== r.value)))}
                />
                {r.label}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <Button size="sm" disabled={pending} onClick={() => run(1)}>
        <Search className="h-3.5 w-3.5" />
        {pending && !result ? "Searching…" : "Search Apollo"}
      </Button>

      {msg && <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {result.total.toLocaleString("en-US")} matches · page {result.page} of {Math.max(1, result.totalPages)} ·{" "}
              {picked.size} picked
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending || page <= 1} onClick={() => run(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending || page >= result.totalPages} onClick={() => run(page + 1)}>
                Next
              </Button>
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-md border border-ink-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-crimson-600"
                      checked={result.people.filter((p) => !p.saved).every((p) => picked.has(p.apollo_id!)) && picked.size > 0}
                      onChange={(e) =>
                        setPicked(e.target.checked ? new Set(result.people.filter((p) => !p.saved).map((p) => p.apollo_id!)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Where</th>
                </tr>
              </thead>
              <tbody>
                {result.people.map((p) => (
                  <tr key={p.apollo_id} className="border-t border-ink-700">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="accent-crimson-600"
                        disabled={p.saved}
                        checked={picked.has(p.apollo_id!)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(p.apollo_id!);
                            else n.delete(p.apollo_id!);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.title}
                        {p.saved && " · already saved"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p>{p.company}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.industry, p.employees ? `${p.employees} staff` : null].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Save to list" className="w-56">
              <Input value={listName} onChange={(e) => setListName(e.target.value)} className="h-9" />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" className="accent-crimson-600" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
              Get their work emails (uses Apollo credits, 1 per person)
            </label>
            <Button size="sm" variant="gold" disabled={pending || picked.size === 0} onClick={save}>
              {pending ? "Saving…" : `Save ${picked.size} to contacts`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
