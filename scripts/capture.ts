/**
 * Cadence Chrome capture agent.
 *
 * Runs on your laptop in a dedicated Chrome profile, opens each competitor's
 * Meta Ad Library, LinkedIn Ad Library, Google Ads Transparency page,
 * LinkedIn company posts, and website, and uploads a screenshot plus the
 * page text for the Research agent to read.
 *
 *   npm run capture -- --login          one time: log into Facebook + LinkedIn
 *   npm run capture -- <runId>          capture every competitor for a run
 *   npm run capture -- <runId> --no-linkedin-pages   skip logged-in LinkedIn
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * The service role key bypasses RLS: keep it on this machine only.
 */
import path from "node:path";
import readline from "node:readline/promises";
import { chromium, type BrowserContext } from "playwright";
import { createClient } from "@supabase/supabase-js";
import {
  capturePage,
  looksLikeLoginWall,
  newPage,
  pause,
  slug,
  targetsFor,
  type CompetitorInput,
} from "./capture-lib";

const PROFILE_DIR = path.resolve(process.cwd(), ".cadence-chrome");

async function openBrowser(): Promise<BrowserContext> {
  const opts = { headless: false, viewport: { width: 1366, height: 900 } } as const;
  try {
    // Real Chrome, separate profile from your everyday one.
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: "chrome" });
  } catch {
    console.warn("Google Chrome not found, falling back to Playwright Chromium.");
    return await chromium.launchPersistentContext(PROFILE_DIR, opts);
  }
}

async function loginFlow() {
  const context = await openBrowser();
  const page = await newPage(context);
  await page.goto("https://www.facebook.com/login");
  const li = await context.newPage();
  await li.goto("https://www.linkedin.com/login");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "\nLog into Facebook and LinkedIn in the Chrome window.\nUse a secondary account if you have one. Press Enter here when done. "
  );
  rl.close();
  await context.close();
  console.log("Saved. Future captures reuse this login.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--login")) return loginFlow();

  const runId = args.find((a) => !a.startsWith("--"));
  if (!runId) {
    console.error("Usage: npm run capture -- <runId>   (copy it from the client page)");
    process.exit(1);
  }
  const linkedinPages = !args.includes("--no-linkedin-pages");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: run, error } = await db
    .from("agent_runs")
    .select("id, client_id, kind, output")
    .eq("id", runId)
    .maybeSingle();
  if (error || !run) {
    console.error("Run not found:", error?.message ?? runId);
    process.exit(1);
  }
  const state = (run.output ?? {}) as { phase?: string; competitors?: CompetitorInput[] };
  const competitors = state.competitors ?? [];
  if (competitors.length === 0) {
    console.error("This run hasn't picked competitors yet. Wait for the Research agent to finish that step.");
    process.exit(1);
  }

  console.log(`Capturing ${competitors.length} competitors: ${competitors.map((c) => c.name).join(", ")}`);
  const context = await openBrowser();
  const page = await newPage(context);
  let ok = 0;
  let failed = 0;

  for (const c of competitors) {
    for (const t of targetsFor(c, { linkedinPages })) {
      process.stdout.write(`  ${c.name} · ${t.source} … `);
      try {
        const result = await capturePage(page, t.url);
        const wall = looksLikeLoginWall(result);
        const file = `${run.client_id}/${run.id}/${slug(c.name)}-${t.source}-${Date.now()}.jpg`;
        const up = await db.storage.from("intel").upload(file, result.jpeg, {
          contentType: "image/jpeg",
          upsert: false,
        });
        if (up.error) throw new Error(`upload failed: ${up.error.message}`);
        await db.from("intel_captures").insert({
          client_id: run.client_id,
          run_id: run.id,
          competitor: c.name,
          source: t.source,
          url: result.finalUrl,
          screenshot_path: file,
          page_text: result.text,
          ok: !wall,
          error: wall ? "Hit a login wall. Run `npm run capture -- --login` first." : null,
        });
        if (wall) {
          failed++;
          console.log("login wall");
        } else {
          ok++;
          console.log("ok");
        }
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        console.log(`failed (${message.slice(0, 80)})`);
        await db.from("intel_captures").insert({
          client_id: run.client_id,
          run_id: run.id,
          competitor: c.name,
          source: t.source,
          url: t.url,
          ok: false,
          error: message.slice(0, 500),
        });
      }
      await pause();
    }
  }
  await context.close();

  // Release the run so the deep dives start.
  const { data: fresh } = await db.from("agent_runs").select("output").eq("id", run.id).maybeSingle();
  const freshState = (fresh?.output ?? {}) as Record<string, unknown>;
  if (freshState.phase === "capture") {
    await db
      .from("agent_runs")
      .update({ output: { ...freshState, phase: "dive" }, step: "Research agent: starting deep dives" })
      .eq("id", run.id);
  }

  console.log(`\nDone. ${ok} captured, ${failed} failed. The Research agent picks these up on its next step.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
