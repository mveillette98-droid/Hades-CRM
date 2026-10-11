import type { BrowserContext, Page } from "playwright";

/**
 * Pure capture logic, no Supabase. Kept separate so it can be tested
 * against any page. No site-specific selectors: we load the page, let it
 * render, scroll to trigger lazy content, then grab a screenshot and the
 * visible text. That's what keeps it from breaking when sites change.
 */

export type CaptureSource = "meta_ads" | "linkedin_ads" | "google_ads" | "linkedin_page" | "website";

export interface Target {
  source: CaptureSource;
  url: string;
}

export interface CompetitorInput {
  name: string;
  website: string;
  linkedin_url?: string;
}

export function targetsFor(c: CompetitorInput, opts: { linkedinPages: boolean }): Target[] {
  const q = encodeURIComponent(c.name);
  const targets: Target[] = [
    {
      source: "meta_ads",
      url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=${q}&search_type=keyword_unordered`,
    },
    { source: "linkedin_ads", url: `https://www.linkedin.com/ad-library/search?accountOwner=${q}` },
  ];
  const domain = domainOf(c.website);
  if (domain) {
    targets.push({
      source: "google_ads",
      url: `https://adstransparency.google.com/?region=US&domain=${encodeURIComponent(domain)}`,
    });
  }
  if (opts.linkedinPages && c.linkedin_url && /linkedin\.com\/company\//.test(c.linkedin_url)) {
    targets.push({
      source: "linkedin_page",
      url: `${c.linkedin_url.replace(/\/+$/, "")}/posts/?feedView=all`,
    });
  }
  if (c.website && /^https?:\/\//.test(normalizeUrl(c.website))) {
    targets.push({ source: "website", url: normalizeUrl(c.website) });
  }
  return targets;
}

export function normalizeUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  return /^https?:\/\//.test(t) ? t : `https://${t}`;
}

export function domainOf(u: string): string | null {
  try {
    return new URL(normalizeUrl(u)).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "x";
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Human-ish pacing between pages so we're not hammering anyone. */
export const pause = () => sleep(2500 + Math.random() * 3000);

const MAX_HEIGHT = 4000;

export interface CaptureResult {
  jpeg: Buffer;
  text: string;
  finalUrl: string;
}

export async function capturePage(page: Page, url: string): Promise<CaptureResult> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Let client-side apps (ad libraries) fetch and render.
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await sleep(2500);
  // Scroll to trigger lazy loading, then back to top.
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 900);
    await sleep(700);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = page.viewportSize()?.width ?? 1366;
  const jpeg = await page.screenshot({
    type: "jpeg",
    quality: 70,
    fullPage: true,
    clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT) },
  });
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  return {
    jpeg,
    text: text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 15_000),
    finalUrl: page.url(),
  };
}

/** Looks like a login wall rather than real content. */
export function looksLikeLoginWall(r: CaptureResult): boolean {
  return /\/(login|checkpoint|authwall|uas\/login)/.test(r.finalUrl) || r.text.length < 40;
}

export async function newPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages()[0];
  return existing ?? (await context.newPage());
}
