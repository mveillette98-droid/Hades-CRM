import "server-only";
import { createHash } from "node:crypto";

/**
 * Meta Conversions API. The browser pixel already fires Lead and Schedule;
 * this sends the same events from the server with the same event_id so Meta
 * dedupes them and still counts visitors whose browser blocks the pixel.
 *
 * Does nothing unless NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_TOKEN are set.
 */
export interface CapiEvent {
  name: "Lead" | "Schedule";
  eventId: string;
  email?: string | null;
  phone?: string | null;
  fbclid?: string | null;
  /** _fbc and _fbp cookies the pixel set, if any */
  fbc?: string | null;
  fbp?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function sendCapiEvent(e: CapiEvent): Promise<void> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return;

  const phone = e.phone?.replace(/\D/g, "");
  const fbc = e.fbc || (e.fbclid ? `fb.1.${Date.now()}.${e.fbclid}` : null);
  const user_data: Record<string, unknown> = {
    em: e.email ? [sha256(e.email.trim().toLowerCase())] : undefined,
    ph: phone ? [sha256(phone.length === 10 ? `1${phone}` : phone)] : undefined,
    fbc: fbc ?? undefined,
    fbp: e.fbp ?? undefined,
    client_ip_address: e.ip ?? undefined,
    client_user_agent: e.userAgent ?? undefined,
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: e.name,
            event_time: Math.floor(Date.now() / 1000),
            event_id: e.eventId,
            action_source: "website",
            event_source_url: e.url ?? undefined,
            user_data,
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`Meta CAPI ${e.name} failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    // Tracking must never break the form.
    console.error(`Meta CAPI ${e.name} failed: ${(err as Error).message}`);
  }
}

/** Request details Meta uses to match the event to a person. */
export function requestContext(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const read = (name: string) => cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] ?? null;
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
    url: req.headers.get("referer"),
    fbc: read("_fbc"),
    fbp: read("_fbp"),
  };
}
