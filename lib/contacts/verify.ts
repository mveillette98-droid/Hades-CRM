/**
 * Email verification through MillionVerifier. Optional: needs
 * MILLIONVERIFIER_API_KEY in .env.local. About $0.0004 per email at
 * their bulk pricing; a 500-person list costs under a dollar.
 */
export type EmailCheck = "valid" | "risky" | "invalid" | "unknown";

type Fetch = typeof fetch;

export function verifierConfigured(): boolean {
  return !!process.env.MILLIONVERIFIER_API_KEY?.trim();
}

export function mapResult(result: string | undefined): EmailCheck {
  switch ((result ?? "").toLowerCase()) {
    case "ok":
      return "valid";
    case "catch_all":
      return "risky";
    case "invalid":
    case "disposable":
      return "invalid";
    default:
      return "unknown";
  }
}

export async function verifyEmail(email: string, f: Fetch = fetch): Promise<EmailCheck> {
  const key = process.env.MILLIONVERIFIER_API_KEY?.trim();
  if (!key) throw new Error("Add MILLIONVERIFIER_API_KEY to .env.local to verify emails.");
  const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&timeout=10`;
  const res = await f(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`MillionVerifier answered ${res.status}.`);
  const body = (await res.json()) as { result?: string; error?: string };
  if (body.error) throw new Error(`MillionVerifier: ${body.error}`);
  return mapResult(body.result);
}

/** Verify a batch, 5 at a time. A failed lookup comes back "unknown". */
export async function verifyMany(
  emails: string[],
  f?: Fetch
): Promise<{ results: Map<string, EmailCheck>; error: string | null }> {
  const results = new Map<string, EmailCheck>();
  let error: string | null = null;
  let i = 0;
  const worker = async () => {
    while (i < emails.length && !error) {
      const e = emails[i++];
      try {
        results.set(e, await verifyEmail(e, f));
      } catch (err) {
        const msg = (err as Error).message;
        // Bad key or no credits: stop instead of burning through the list.
        if (/api|credit|401|403|key/i.test(msg)) error = msg;
        else results.set(e, "unknown");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, emails.length) }, worker));
  return { results, error };
}
