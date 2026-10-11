"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice, nativeSelect } from "@/components/outbound/bits";
import { addContactsToCampaign, deleteContacts, verifyContacts } from "@/lib/contacts/actions";
import type { Contact, ContactEmailStatus } from "@/lib/supabase/types";

const STATUS: Record<ContactEmailStatus, { label: string; variant: "gold" | "crimson" | "outline" }> = {
  valid: { label: "Valid", variant: "gold" },
  risky: { label: "Catch-all", variant: "outline" },
  invalid: { label: "Invalid", variant: "crimson" },
  unknown: { label: "Unknown", variant: "outline" },
  unverified: { label: "Not verified", variant: "outline" },
};

export function ContactsTable({
  clientId,
  contacts,
  inCampaign,
  campaigns,
  canVerify,
}: {
  clientId: string;
  contacts: Contact[];
  inCampaign: Record<string, string>;
  campaigns: { id: string; name: string; status: string }[];
  canVerify: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [includeRisky, setIncludeRisky] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const ids = Array.from(picked);

  const act = (fn: () => Promise<void>) =>
    start(async () => {
      setMsg(undefined);
      await fn();
      router.refresh();
    });

  if (contacts.length === 0) return <p className="text-sm text-muted-foreground">No contacts here yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink-700 bg-ink-900 px-3 py-2">
        <span className="text-xs text-muted-foreground">{picked.size} selected</span>
        {canVerify ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={pending || picked.size === 0}
            onClick={() =>
              act(async () => {
                const res = await verifyContacts(clientId, ids);
                if (!res.ok) return setMsg({ ok: false, text: res.error });
                const d = res.data!;
                setMsg({ ok: true, text: `Checked ${d.checked}: ${d.valid} valid, ${d.risky} catch-all, ${d.invalid} invalid, ${d.unknown} unknown.` });
              })
            }
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            {pending ? "Working…" : "Verify emails"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Add MILLIONVERIFIER_API_KEY to verify here.</span>
        )}
        <span className="mx-1 h-4 w-px bg-ink-700" />
        {campaigns.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No open campaign for this client.{" "}
            <Link href="/outbound" className="text-crimson-400 hover:underline">
              Create one
            </Link>
            .
          </span>
        ) : (
          <>
            <select className={`${nativeSelect} h-7 w-56 text-xs`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="accent-crimson-600" checked={includeRisky} onChange={(e) => setIncludeRisky(e.target.checked)} />
              include catch-all
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-gold-300"
              disabled={pending || picked.size === 0 || !campaignId}
              onClick={() =>
                act(async () => {
                  const res = await addContactsToCampaign(campaignId, ids, { includeRisky });
                  if (!res.ok) return setMsg({ ok: false, text: res.error });
                  const d = res.data!;
                  const skipped = [
                    d.noEmail && `${d.noEmail} without an email`,
                    d.badEmail && `${d.badEmail} invalid${includeRisky ? "" : " or catch-all"}`,
                    d.alreadyContacted && `${d.alreadyContacted} already in a campaign`,
                    d.suppressed && `${d.suppressed} on the do-not-email list`,
                  ].filter(Boolean);
                  setMsg({ ok: true, text: `Added ${d.added} to the campaign.${skipped.length ? ` Skipped ${skipped.join(", ")}.` : ""}` });
                  setPicked(new Set());
                })
              }
            >
              <Send className="h-3.5 w-3.5" />
              Add to campaign
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs hover:text-crimson-400"
          disabled={pending || picked.size === 0}
          onClick={() =>
            confirm(`Delete ${picked.size} contacts? Campaign history stays.`) &&
            act(async () => {
              const res = await deleteContacts(clientId, ids);
              if (!res.ok) setMsg({ ok: false, text: res.error });
              setPicked(new Set());
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {msg && <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}

      <div className="overflow-x-auto rounded-md border border-ink-700">
        <table className="w-full text-sm">
          <thead className="bg-ink-900 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  className="accent-crimson-600"
                  checked={picked.size === contacts.length}
                  onChange={(e) => setPicked(e.target.checked ? new Set(contacts.map((c) => c.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">List</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-ink-700 align-top">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-crimson-600"
                    checked={picked.has(c.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="ml-2 text-xs font-normal text-muted-foreground hover:text-crimson-400">
                        LinkedIn
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.title}</p>
                </td>
                <td className="px-3 py-2">
                  <p>{c.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {[[c.city, c.state].filter(Boolean).join(", "), c.employees ? `${c.employees} staff` : null].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {c.email ? (
                    <>
                      <p className="text-xs">{c.email}</p>
                      <Badge variant={STATUS[c.email_status].variant} className="mt-1">
                        {STATUS[c.email_status].label}
                      </Badge>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No email yet</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {c.list_name ?? "Unsorted"}
                  {inCampaign[c.id] && <span className="block text-gold-300">In {inCampaign[c.id]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contacts.length === 1000 && <p className="text-xs text-muted-foreground">Showing the newest 1,000. Filter by list to see the rest.</p>}
    </div>
  );
}
