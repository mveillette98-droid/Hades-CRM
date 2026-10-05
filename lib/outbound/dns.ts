import { promises as dnsp } from "node:dns";

/**
 * Deliverability checks for a sending domain: MX, SPF, DKIM, DMARC.
 * Each check says pass / warn / fail in plain English and, when something
 * is wrong, the exact record to add.
 */

export type Provider = "google" | "microsoft" | "zoho" | "custom";
export type CheckStatus = "pass" | "warn" | "fail";

export interface DnsFix {
  type: "TXT" | "MX" | "CNAME";
  host: string;
  value: string;
}

export interface DomainCheck {
  key: "mx" | "spf" | "dkim" | "dmarc";
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: DnsFix;
}

export interface DomainReport {
  domain: string;
  provider: Provider;
  ok: boolean; // no fails
  checks: DomainCheck[];
}

export interface Resolver {
  txt(name: string): Promise<string[]>;
  mx(name: string): Promise<string[]>;
}

/** Empty answer = the record doesn't exist. Anything else = we couldn't tell. */
class LookupError extends Error {}

const NO_RECORD = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/** DNS over HTTPS (Google). Used when the local resolver times out, which
 *  happens with big TXT records on some networks. */
async function doh(name: string, type: "TXT" | "MX"): Promise<string[]> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new LookupError(`DNS over HTTPS answered ${res.status}`);
  const body = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
  if (body.Status === 3) return []; // NXDOMAIN
  if (body.Status !== 0) throw new LookupError(`DNS status ${body.Status}`);
  const want = type === "TXT" ? 16 : 15;
  return (body.Answer ?? [])
    .filter((a) => a.type === want)
    .map((a) =>
      type === "TXT"
        ? a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, "")
        : a.data.split(/\s+/).at(-1)!.toLowerCase().replace(/\.$/, "")
    );
}

async function withFallback(name: string, type: "TXT" | "MX", native: () => Promise<string[]>): Promise<string[]> {
  try {
    return await native();
  } catch (e) {
    if (NO_RECORD.has((e as { code?: string }).code ?? "")) return [];
    try {
      return await doh(name, type);
    } catch {
      throw new LookupError((e as Error).message);
    }
  }
}

export const systemResolver: Resolver = {
  txt: (name) =>
    withFallback(name, "TXT", async () => (await dnsp.resolveTxt(name)).map((chunks) => chunks.join(""))),
  mx: (name) =>
    withFallback(name, "MX", async () =>
      (await dnsp.resolveMx(name)).map((r) => r.exchange.toLowerCase().replace(/\.$/, ""))
    ),
};

export function providerFor(smtpHost: string): Provider {
  const h = smtpHost.toLowerCase();
  if (h.includes("gmail") || h.includes("google")) return "google";
  if (h.includes("office365") || h.includes("outlook")) return "microsoft";
  if (h.includes("zoho")) return "zoho";
  return "custom";
}

const PROVIDER = {
  google: {
    name: "Google Workspace",
    mx: /google(mail)?\.com\.?$/,
    spfInclude: "_spf.google.com",
    dkimSelectors: ["google"],
    dkimHow: "Google Admin > Apps > Google Workspace > Gmail > Authenticate email > Generate new record, add it, then press Start authentication.",
  },
  microsoft: {
    name: "Microsoft 365",
    mx: /mail\.protection\.outlook\.com\.?$/,
    spfInclude: "spf.protection.outlook.com",
    dkimSelectors: ["selector1", "selector2"],
    dkimHow: "Microsoft Defender portal > Email authentication settings > DKIM: add the two CNAME records it shows, then enable signing.",
  },
  zoho: {
    name: "Zoho Mail",
    mx: /zoho(mail)?\.(com|eu|in)\.?$/,
    spfInclude: "zoho",
    dkimSelectors: ["zmail", "zoho", "default"],
    dkimHow: "Zoho Mail Admin > Domains > Email configuration > DKIM: add a selector, copy the TXT record, then verify.",
  },
  custom: {
    name: "your email provider",
    mx: /./,
    spfInclude: "",
    dkimSelectors: ["default", "dkim", "mail", "k1", "s1", "selector1", "google"],
    dkimHow: "Your email provider's admin panel has a DKIM record to add. Add it as a TXT record.",
  },
} as const;

const SPF_FIX: Record<Provider, string> = {
  google: "v=spf1 include:_spf.google.com ~all",
  microsoft: "v=spf1 include:spf.protection.outlook.com -all",
  zoho: "v=spf1 include:zohomail.com ~all",
  custom: "v=spf1 include:<your provider's SPF domain> ~all",
};

const MX_FIX: Record<Provider, string> = {
  google: "smtp.google.com (priority 1)",
  microsoft: "<your-domain>.mail.protection.outlook.com (priority 0)",
  zoho: "mx.zoho.com (10), mx2.zoho.com (20), mx3.zoho.com (50)",
  custom: "the MX host your provider gives you",
};

export async function checkDomain(
  domain: string,
  provider: Provider,
  resolver: Resolver = systemResolver
): Promise<DomainReport> {
  const d = domain.toLowerCase().replace(/\.$/, "");
  const p = PROVIDER[provider];
  const checks: DomainCheck[] = [];

  const run = async (key: DomainCheck["key"], label: string, fn: () => Promise<DomainCheck>) => {
    try {
      checks.push(await fn());
    } catch (e) {
      checks.push({
        key,
        label,
        status: "warn",
        detail: `Couldn't look this up right now (${(e as Error).message}). Check again in a few minutes.`,
      });
    }
  };

  // MX: without it replies bounce, and receivers trust the domain less.
  await run("mx", "MX (receiving replies)", async () => {
    const mx = await resolver.mx(d);
    if (mx.length === 0) {
      return {
        key: "mx",
        label: "MX (receiving replies)",
        status: "fail",
        detail: "No MX record. Replies to this domain will bounce, and inbox providers treat domains that can't receive mail as spam.",
        fix: { type: "MX", host: "@", value: MX_FIX[provider] },
      };
    }
    if (provider !== "custom" && !mx.some((h) => p.mx.test(h))) {
      return {
        key: "mx",
        label: "MX (receiving replies)",
        status: "warn",
        detail: `MX points to ${mx.join(", ")}, not ${p.name}. Replies may not land in this inbox.`,
        fix: { type: "MX", host: "@", value: MX_FIX[provider] },
      };
    }
    return { key: "mx", label: "MX (receiving replies)", status: "pass", detail: `Points to ${mx.slice(0, 2).join(", ")}.` };
  });

  // SPF: exactly one record, includes the sending provider, never +all.
  await run("spf", "SPF", async () => {
    const spf = (await resolver.txt(d)).filter((t) => /^v=spf1\b/i.test(t.trim()));
    if (spf.length === 0) {
      return {
        key: "spf",
        label: "SPF",
        status: "fail",
        detail: "No SPF record. Receivers can't tell this server is allowed to send for the domain.",
        fix: { type: "TXT", host: "@", value: SPF_FIX[provider] },
      };
    }
    if (spf.length > 1) {
      return {
        key: "spf",
        label: "SPF",
        status: "fail",
        detail: `${spf.length} SPF records found. Two SPF records break both. Merge them into one.`,
        fix: { type: "TXT", host: "@", value: SPF_FIX[provider] },
      };
    }
    const rec = spf[0].toLowerCase();
    if (/\s\+all\b/.test(rec)) {
      return {
        key: "spf",
        label: "SPF",
        status: "fail",
        detail: "SPF ends in +all, which lets anyone send as you. Use ~all.",
        fix: { type: "TXT", host: "@", value: SPF_FIX[provider] },
      };
    }
    if (p.spfInclude && !rec.includes(p.spfInclude)) {
      return {
        key: "spf",
        label: "SPF",
        status: "fail",
        detail: `SPF doesn't include ${p.name}, so its mail fails SPF.`,
        fix: { type: "TXT", host: "@", value: SPF_FIX[provider] },
      };
    }
    return { key: "spf", label: "SPF", status: "pass", detail: spf[0] };
  });

  // DKIM: look under the provider's selectors.
  await run("dkim", "DKIM", async () => {
    for (const sel of p.dkimSelectors) {
      const recs = await resolver.txt(`${sel}._domainkey.${d}`);
      if (recs.some((r) => /v=dkim1|k=rsa|p=[a-z0-9+/]{20,}/i.test(r))) {
        return { key: "dkim", label: "DKIM", status: "pass", detail: `Signing key found at ${sel}._domainkey.` };
      }
    }
    return {
      key: "dkim",
      label: "DKIM",
      status: provider === "custom" ? "warn" : "fail",
      detail:
        provider === "custom"
          ? `No DKIM key at the usual selectors. If your provider uses a different one, you're fine. Otherwise: ${p.dkimHow}`
          : `No DKIM key found. Without it Gmail and Outlook will spam-folder you. ${p.dkimHow}`,
      fix: { type: "TXT", host: `${p.dkimSelectors[0]}._domainkey`, value: "the key your provider generates" },
    };
  });

  // DMARC: has to exist. p=none is fine while warming and sending.
  await run("dmarc", "DMARC", async () => {
    const recs = (await resolver.txt(`_dmarc.${d}`)).filter((t) => /^v=dmarc1/i.test(t.trim()));
    if (recs.length === 0) {
      return {
        key: "dmarc",
        label: "DMARC",
        status: "fail",
        detail: "No DMARC record. Gmail and Yahoo require one from bulk senders, and cold email gets judged by the same rules.",
        fix: { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none; adkim=r; aspf=r" },
      };
    }
    const policy = recs[0].match(/\bp=(none|quarantine|reject)/i)?.[1]?.toLowerCase();
    if (!policy) {
      return {
        key: "dmarc",
        label: "DMARC",
        status: "warn",
        detail: `DMARC record has no valid policy: ${recs[0]}`,
        fix: { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none; adkim=r; aspf=r" },
      };
    }
    return {
      key: "dmarc",
      label: "DMARC",
      status: "pass",
      detail: policy === "none" ? "Policy p=none. Fine for sending; tighten to quarantine once things are stable." : `Policy p=${policy}.`,
    };
  });

  return { domain: d, provider, ok: !checks.some((c) => c.status === "fail"), checks };
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
