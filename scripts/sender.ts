/**
 * Cadence sender. Sends due campaign emails and reads replies.
 *
 *   npm run sender            run until you stop it (Ctrl+C), one pass a minute
 *   npm run sender -- --once  one pass, then exit
 *
 * Leave it running in a terminal while campaigns are live. If the laptop
 * sleeps, nothing sends; it picks up where it left off when it wakes.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * CADENCE_SECRET_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { tick } from "../lib/outbound/engine";
import { decryptSecret } from "../lib/outbound/crypto";
import { imapInbox, smtpMailer } from "../lib/outbound/transport";

const INTERVAL_MS = 60_000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.CADENCE_SECRET_KEY) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CADENCE_SECRET_KEY in .env.local."
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const once = process.argv.includes("--once");

  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(0);
    stopping = true;
    console.log("\nStopping after this pass. Ctrl+C again to quit now.");
  });

  const stamp = () => new Date().toLocaleTimeString();
  console.log(`[${stamp()}] Cadence sender running. Ctrl+C to stop.`);

  while (!stopping) {
    const started = Date.now();
    try {
      const r = await tick({
        db,
        mailer: smtpMailer,
        inbox: imapInbox,
        decrypt: decryptSecret,
        log: (m) => console.log(`[${stamp()}] ${m}`),
      });
      if (r.sent || r.inbound || r.errors.length) {
        console.log(`[${stamp()}] pass done: ${r.sent} sent, ${r.inbound} inbound, ${r.errors.length} errors`);
      }
    } catch (e) {
      console.error(`[${stamp()}] pass failed: ${(e as Error).message}`);
    }
    if (once) break;
    const wait = Math.max(5_000, INTERVAL_MS - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
}

main();
