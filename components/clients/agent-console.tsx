"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Chrome, Mail, Megaphone, Play, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PulseDot } from "@/components/pulse-dot";
import { CopyButton } from "./copy-button";
import { continueAfterCapture, stopRun } from "@/lib/clients/actions";
import { cn } from "@/lib/utils";
import type { AgentKind } from "@/lib/supabase/types";
import type { Phase } from "@/lib/agents/pipelines";

export interface ActiveRun {
  id: string;
  kind: AgentKind;
  phase: Phase | null;
  step: string | null;
  error: string | null;
  divesDone: number;
  competitorCount: number;
}

interface AgentConsoleProps {
  clientId: string;
  hasResearch: boolean;
  activeRun: ActiveRun | null;
  /** Kick off onboarding on mount (right after the client is created). */
  autoStartResearch?: boolean;
}

const AGENTS: {
  kind: AgentKind;
  title: string;
  blurb: string;
  Icon: typeof Search;
  needsResearch: boolean;
}[] = [
  {
    kind: "research",
    title: "Onboarding",
    blurb:
      "Research agent profiles the client and dives into its top 3 competitors. Strategy agent builds the playbook, market report, and scripts.",
    Icon: Search,
    needsResearch: false,
  },
  {
    kind: "cold_email",
    title: "Cold email",
    blurb: "A sequence per top angle. Writer drafts, critic scores, writer revises.",
    Icon: Mail,
    needsResearch: true,
  },
  {
    kind: "content",
    title: "LinkedIn content",
    blurb: "A week of posts for the firm owner, run through the same critic.",
    Icon: Megaphone,
    needsResearch: true,
  },
];

const MAX_RETRIES = 3;
const BACKOFF_MS = [5_000, 15_000, 30_000];
const CAPTURE_POLL_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AgentConsole({
  clientId,
  hasResearch,
  activeRun,
  autoStartResearch,
}: AgentConsoleProps) {
  const router = useRouter();
  const [instructions, setInstructions] = useState("");
  const [pauseForCapture, setPauseForCapture] = useState(true);
  const [driving, setDriving] = useState<{ runId: string; step: string; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(activeRun?.error ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [pending, startTransition] = useTransition();
  const cancelled = useRef(false);

  useEffect(() => {
    if (!driving) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [driving?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  /**
   * Drive a run to completion, one step per request. Retries transient
   * failures with backoff, waits politely when another tab holds the run,
   * and stops at the Chrome capture pause.
   */
  const drive = useCallback(
    async (runId: string, firstStep: string) => {
      setError(null);
      setElapsed(0);
      setDriving({ runId, step: firstStep });
      let retries = 0;
      try {
        for (let i = 0; i < 40 && !cancelled.current; i++) {
          let res: Response;
          let json: {
            error?: string;
            step?: string;
            done?: boolean;
            waiting?: string;
            busy?: boolean;
            retryable?: boolean;
          } = {};
          try {
            res = await fetch(`/api/agents/runs/${runId}/advance`, { method: "POST" });
            json = await res.json().catch(() => ({}));
          } catch {
            res = new Response(null, { status: 599 });
            json = { error: "Lost connection to the agent.", retryable: true };
          }
          router.refresh();

          if (res.status === 409 && json.busy) {
            setDriving({ runId, step: json.step ?? "Working", note: "Another tab is running this step. Waiting." });
            await sleep(10_000);
            continue;
          }
          if (!res.ok) {
            const retryable = json.retryable ?? res.status >= 500;
            if (retryable && retries < MAX_RETRIES) {
              const wait = BACKOFF_MS[retries] ?? 30_000;
              retries++;
              setDriving({
                runId,
                step: json.step ?? "Retrying",
                note: `Hiccup: ${json.error ?? "step failed"}. Retry ${retries} of ${MAX_RETRIES} in ${wait / 1000}s.`,
              });
              await sleep(wait);
              continue;
            }
            setError(json.error ?? `Agent step failed (${res.status}). Hit resume to try again.`);
            return;
          }
          retries = 0;
          if (json.done || json.waiting) return;
          if (json.step) setDriving({ runId, step: json.step });
        }
      } finally {
        setDriving(null);
      }
    },
    [router]
  );

  async function start(kind: AgentKind) {
    setError(null);
    const res = await fetch("/api/agents/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        kind,
        instructions: instructions || undefined,
        waitForCapture: kind === "research" ? pauseForCapture : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
    if (!res.ok || !json.runId) {
      setError(json.error ?? "Could not start the run.");
      return;
    }
    router.refresh();
    await drive(json.runId, kind === "research" ? "Research agent: profiling the client" : "Writing");
  }

  // Auto-start onboarding right after a client is created.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStartResearch || autoStarted.current || activeRun) return;
    autoStarted.current = true;
    router.replace(`/clients/${clientId}`, { scroll: false });
    void start("research");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartResearch]);

  const busy = driving !== null;
  const waitingOnCapture = !busy && activeRun?.phase === "capture";

  // While paused for capture, re-check the run every few seconds. When the
  // capture script on the laptop releases it, pick the run straight back up.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (!waitingOnCapture) return;
    wasWaiting.current = true;
    const t = setInterval(() => router.refresh(), CAPTURE_POLL_MS);
    return () => clearInterval(t);
  }, [waitingOnCapture, router]);

  useEffect(() => {
    if (!wasWaiting.current || busy || !activeRun || activeRun.phase === "capture") return;
    wasWaiting.current = false;
    void drive(activeRun.id, activeRun.step ?? "Research agent: starting deep dives");
  }, [activeRun, busy, drive]);

  const pausedRun = !busy && activeRun && activeRun.phase !== "capture" ? activeRun : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {AGENTS.map(({ kind, title, blurb, Icon, needsResearch }) => {
          const locked = needsResearch && !hasResearch;
          const disabled = busy || Boolean(activeRun) || locked;
          return (
            <div
              key={kind}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900 p-4",
                !disabled && "hb-hover-glow"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-crimson-500" />
                  <p className="font-display text-sm font-semibold">{title}</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{blurb}</p>
              </div>
              <Button
                size="sm"
                variant={kind === "research" ? "default" : "secondary"}
                disabled={disabled}
                onClick={() => start(kind)}
              >
                <Play className="h-3.5 w-3.5" />
                {locked ? "Needs onboarding first" : "Run"}
              </Button>
            </div>
          );
        })}
      </div>

      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        disabled={busy}
        placeholder="Optional notes or intel for the next run. Paste anything you saw yourself, or steer it: Focus on construction firms in Texas."
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={pauseForCapture}
          onChange={(e) => setPauseForCapture(e.target.checked)}
          disabled={busy}
          className="h-3.5 w-3.5 accent-crimson-600"
        />
        Onboarding: pause after competitors are picked so the Chrome capture agent can grab ad libraries and LinkedIn
      </label>

      {activeRun?.kind === "research" && (busy || activeRun) && <StageTracker run={activeRun} />}

      {busy && driving && (
        <div className="space-y-1 rounded-md border border-crimson-800/50 bg-crimson-900/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <PulseDot label={driving.step} variant="crimson" />
            <span className="font-mono text-xs text-muted-foreground">{formatElapsed(elapsed)}</span>
          </div>
          {driving.note && <p className="text-xs text-gold-200">{driving.note}</p>}
        </div>
      )}

      {waitingOnCapture && activeRun && (
        <div className="space-y-3 rounded-md border border-gold-700/50 bg-gold-900/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <Chrome className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gold-100">
                Competitors picked. Run the Chrome capture agent on your laptop.
              </p>
              <p className="text-xs text-muted-foreground">
                It screenshots each competitor&rsquo;s Meta Ad Library, LinkedIn Ad Library, Google Ads, LinkedIn posts,
                and website. When it finishes, this run continues by itself.
              </p>
            </div>
          </div>
          <CommandLine cmd="npm run capture -- --login" note="One time only: log into Facebook and LinkedIn." />
          <CommandLine cmd={`npm run capture -- ${activeRun.id}`} note="Capture this run's competitors." />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PulseDot label="Waiting for capture" variant="gold" />
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await continueAfterCapture(activeRun.id, clientId);
                  router.refresh();
                })
              }
            >
              Skip capture and continue
            </Button>
          </div>
        </div>
      )}

      {pausedRun && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold-700/50 bg-gold-900/10 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-gold-200">Run paused at: {pausedRun.step ?? "next step"}</p>
            <p className="text-xs text-muted-foreground">
              Everything up to here is saved. Resume picks up from the last finished step.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="gold" onClick={() => drive(pausedRun.id, pausedRun.step ?? "Resuming")}>
              <Play className="h-3.5 w-3.5" />
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await stopRun(pausedRun.id, clientId);
                  setError(null);
                  router.refresh();
                })
              }
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-crimson-800/60 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const STAGES: { agent: string; phases: Phase[]; label: string }[] = [
  { agent: "Research", phases: ["profile"], label: "Client profile" },
  { agent: "Research", phases: ["competitors"], label: "Top 3 competitors" },
  { agent: "Research", phases: ["capture"], label: "Chrome capture" },
  { agent: "Research", phases: ["dive"], label: "Competitor deep dives" },
  { agent: "Strategy", phases: ["strategy"], label: "Playbook" },
  { agent: "Strategy", phases: ["report"], label: "Market report" },
  { agent: "Strategy", phases: ["scripts"], label: "Scripts" },
];
const ORDER: Phase[] = ["profile", "competitors", "capture", "dive", "strategy", "report", "scripts", "done"];

function StageTracker({ run }: { run: ActiveRun }) {
  const current = ORDER.indexOf(run.phase ?? "profile");
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {STAGES.map((s) => {
        const idx = ORDER.indexOf(s.phases[0]!);
        const state = idx < current ? "done" : idx === current ? "now" : "todo";
        const label =
          s.phases[0] === "dive" && run.competitorCount
            ? `${s.label} (${Math.min(run.divesDone, run.competitorCount)}/${run.competitorCount})`
            : s.label;
        return (
          <li
            key={s.label}
            className={cn(
              "rounded-md border px-2.5 py-2 text-[11px]",
              state === "done" && "border-gold-700/50 bg-gold-900/10 text-gold-200",
              state === "now" && "border-crimson-700/60 bg-crimson-900/20 text-foreground",
              state === "todo" && "border-ink-700 text-muted-foreground"
            )}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70">{s.agent} agent</p>
            <p className="mt-0.5 flex items-center gap-1 font-medium">
              {state === "done" && <Check className="h-3 w-3" />}
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function CommandLine({ cmd, note }: { cmd: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-ink-700 bg-ink-950 px-3 py-2">
      <div className="min-w-0">
        <code className="block truncate font-mono text-xs text-foreground">{cmd}</code>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
      <CopyButton text={cmd} />
    </div>
  );
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
