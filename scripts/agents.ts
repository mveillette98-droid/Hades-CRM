/**
 * Cadence agent worker. Finishes agent runs nobody is watching: teardowns
 * queued when an ads lead books a call, and any run whose tab got closed.
 *
 *   npm run agents            run until you stop it (Ctrl+C), checks every 30s
 *   npm run agents -- --once  finish what's queued now, then exit
 *
 * One run at a time, one agent call per step, oldest run first. A run whose
 * current step has failed 3 times is left alone: open it on the client page
 * and hit resume once you've looked at the error.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * ANTHROPIC_API_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { stepRun } from "../lib/agents/step";
import type { RunState } from "../lib/agents/pipelines";

const INTERVAL_MS = 30_000;
const MAX_FAILURES = 3;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY in .env.local."
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const once = process.argv.includes("--once");

  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(0);
    stopping = true;
    console.log("\nStopping after this step. Ctrl+C again to quit now.");
  });

  const stamp = () => new Date().toLocaleTimeString();
  const log = (m: string) => console.log(`[${stamp()}] ${m}`);
  log("Cadence agent worker running. Ctrl+C to stop.");

  while (!stopping) {
    let worked = false;
    try {
      const { data, error } = await db
        .from("agent_runs")
        .select("id, output, locked_until, clients(name)")
        .eq("status", "running")
        .order("created_at", { ascending: true })
        .limit(20);
      if (error) throw new Error(error.message);

      const now = Date.now();
      const ready = (data ?? []).filter((r) => {
        const state = (r.output ?? {}) as RunState;
        const locked = r.locked_until && new Date(r.locked_until).getTime() > now;
        return !locked && state.phase !== "capture" && (state.failures ?? 0) < MAX_FAILURES;
      });

      const run = ready[0];
      if (run) {
        const name = (run.clients as unknown as { name: string } | null)?.name ?? "client";
        const res = await stepRun(db, run.id);
        worked = res.httpStatus === 200 && !res.body.done && !res.body.waiting;
        if (res.body.error) log(`${name}: ${res.body.error}`);
        else if (res.body.done) log(`${name}: run finished.`);
        else if (res.body.waiting) log(`${name}: waiting for Chrome capture. Run npm run capture.`);
        else log(`${name}: next up, ${res.body.step}`);
        // A finished step means more work is queued, so don't sleep.
        if (res.body.done) worked = true;
      }
    } catch (e) {
      log(`pass failed: ${(e as Error).message}`);
    }
    if (once && !worked) break;
    if (!worked) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
