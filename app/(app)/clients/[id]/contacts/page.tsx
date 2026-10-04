import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/outbound/bits";
import { ApolloSearch } from "@/components/contacts/apollo-search";
import { ContactImport } from "@/components/contacts/contact-import";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { getClient } from "@/lib/clients/queries";
import { apolloDefaults, campaignsFor, contactStats, listContacts, listNames, type ContactFilters } from "@/lib/contacts/queries";
import { apolloConfigured } from "@/lib/contacts/apollo";
import { verifierConfigured } from "@/lib/contacts/verify";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: NonNullable<ContactFilters["status"]>; label: string }[] = [
  { value: "valid", label: "Valid" },
  { value: "unverified", label: "Not verified" },
  { value: "risky", label: "Catch-all" },
  { value: "invalid", label: "Invalid" },
  { value: "no_email", label: "No email" },
];

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { list?: string; status?: string; q?: string };
}) {
  const client = await getClient(params.id);
  if (!client) notFound();

  const filters: ContactFilters = {
    list: searchParams.list || undefined,
    status: STATUS_FILTERS.some((s) => s.value === searchParams.status)
      ? (searchParams.status as ContactFilters["status"])
      : undefined,
    q: searchParams.q || undefined,
  };

  const supabase = createClient();
  const [contacts, stats, lists, defaults, { data: campaignRows }] = await Promise.all([
    listContacts(client.id, filters),
    contactStats(client.id),
    listNames(client.id),
    apolloDefaults(client.id),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("client_id", client.id)
      .in("status", ["draft", "active", "paused"])
      .order("created_at", { ascending: false }),
  ]);
  const inCampaign = Object.fromEntries(await campaignsFor(contacts.map((c) => c.id)));
  const apollo = apolloConfigured();

  const href = (patch: Partial<Record<"list" | "status" | "q", string | undefined>>) => {
    const p = new URLSearchParams();
    const next = { list: filters.list, status: filters.status, q: filters.q, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/clients/${client.id}/contacts${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <TopBar title={`${client.name} contacts`} />
      <main className="flex-1 space-y-6 px-8 py-8">
        <div className="space-y-2">
          <Link href={`/clients/${client.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-crimson-400">
            <ArrowLeft className="h-3.5 w-3.5" />
            {client.name}
          </Link>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Contacts</h2>
          <p className="text-sm text-muted-foreground">
            The people {client.name}&rsquo;s campaigns go to. Find them in Apollo or import a CSV, verify the emails, then add them to a campaign.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Contacts" value={stats.total.toLocaleString("en-US")} />
          <Stat label="With email" value={stats.withEmail.toLocaleString("en-US")} />
          <Stat label="Verified valid" value={stats.valid.toLocaleString("en-US")} />
          <Stat label="Invalid" value={stats.invalid.toLocaleString("en-US")} sub="Never sent to" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find people in Apollo</CardTitle>
            <CardDescription>
              Searching is free. Getting emails spends Apollo credits, and only for the people you save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apollo ? (
              <ApolloSearch clientId={client.id} defaults={defaults} />
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Apollo isn&rsquo;t connected. To connect it:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>In Apollo, go to Settings &gt; Integrations &gt; API and create a key (paid plans include API access).</li>
                  <li>
                    Add <code className="rounded bg-ink-950 px-1 text-foreground">APOLLO_API_KEY=your-key</code> to{" "}
                    <code className="rounded bg-ink-950 px-1 text-foreground">.env.local</code> and restart{" "}
                    <code className="rounded bg-ink-950 px-1 text-foreground">npm run dev</code>.
                  </li>
                </ol>
                <p>CSV import below works without it.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import a CSV</CardTitle>
            <CardDescription>Exports from Apollo, Clay, Sales Navigator tools or a Google Sheet. Needs an email column.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContactImport clientId={client.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All contacts</CardTitle>
            <CardDescription>
              Verify before you send: invalid emails are never added to a campaign, and catch-all only if you say so.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip href={href({ status: undefined })} active={!filters.status} label="Any email" />
              {STATUS_FILTERS.map((s) => (
                <Chip key={s.value} href={href({ status: s.value })} active={filters.status === s.value} label={s.label} />
              ))}
              {lists.length > 0 && <span className="mx-1 h-4 w-px bg-ink-700" />}
              {lists.length > 0 && <Chip href={href({ list: undefined })} active={!filters.list} label="All lists" />}
              {lists.map((l) => (
                <Chip key={l} href={href({ list: l })} active={filters.list === l} label={l} />
              ))}
              <form action={`/clients/${client.id}/contacts`} className="ml-auto">
                {filters.list && <input type="hidden" name="list" value={filters.list} />}
                {filters.status && <input type="hidden" name="status" value={filters.status} />}
                <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search name, company, email" className="h-8 w-60 text-xs" />
              </form>
            </div>
            <ContactsTable
              clientId={client.id}
              contacts={contacts}
              inCampaign={inCampaign}
              campaigns={(campaignRows ?? []) as { id: string; name: string; status: string }[]}
              canVerify={verifierConfigured()}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-crimson-600 text-foreground" : "border-ink-700 text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const client = await getClient(params.id);
  return { title: `${client?.name ?? "Client"} contacts · Cadence GTM` };
}
