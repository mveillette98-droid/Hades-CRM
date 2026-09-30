"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Megaphone, Play, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PulseDot } from "@/components/pulse-dot";
import { stopRun } from "@/lib/clients/actions";
import { cn } from "@/lib/utils";
import type { AgentKind } from "@/lib/supabase/types";

interface ActiveRun {
  id: string;
  kind: AgentKind;
  step: string | null;
  error: string | null;
}

interface AgentConsoleProps {
  clientId: string;
  hasResearch: boolean;
  activeRun: ActiveRun | null;
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
    title: "Research",
    blurb: "ICP, pains, objections, competitors, and outbound angles. Searches the web.",
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

export function AgentConsole({ clientId, hasResearch, activeRun }: AgentConsoleProps) {
  const router = useRouter();
  const [instructions, setInstructions] = useState("");
  const [driving, setDriving] = useState<{ runId: string; step: string } | null>(null);
  const [error, setError] = useState<string | null>(activeRun?.error ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [stopping, startStop] = useTransition();
  const cancelled = useRef(false);

  useEffect(() => {
    if (!driving) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [driving]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function drive(runId: string, firstStep: string) {
    setError(null);
    setElapsed(0);
    setDriving({ runId, step: firstStep });
    try {
      for (let i = 0; i < 12 && !cancelled.current; i++) {
        const res = await fetch(`/api/agents/runs/${runId}/advance`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          step?: string;
          done?: boolean;
        };
        router.refresh();
        if (!res.ok) {
          setError(json.error ?? `Agent step failed (${res.status}).`);
          return;
        }
        if (json.done) return;
        if (json.step) setDriving({ runId, step: json.step });
      }
    } catch {
      setError("Lost connection to the agent. Hit resume to pick up where it stopped.");
    } finally {
      setDriving(null);
    }
  }

  async function start(kind: AgentKind) {
    setError(null);
    const res = await fetch("/api/agents/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind, instructions: instructions || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
    if (!res.ok || !json.runId) {
      setError(json.error ?? "Could not start the run.");
      return;
    }
    router.refresh();
    await drive(json.runId, kind === "research" ? "Researching the market" : "Writing");
  }

  const busy = driving !== null;
  const pendingRun = !busy ? activeRun : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {AGENTS.map(({ kind, title, blurb, Icon, needsResearch }) => {
          const locked = needsResearch && !hasResearch;
          const disabled = busy || Boolean(pendingRun) || locked;
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
                {locked ? "Needs research first" : "Run"}
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
        placeholder="Optional steer for the next run. e.g. Focus on construction firms in Texas. Tax season push. Skip the pricing angle."
      />

      {busy && driving && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-crimson-800/50 bg-crimson-900/10 px-4 py-3">
          <PulseDot label={driving.step} variant="crimson" />
          <span className="font-mono text-xs text-muted-foreground">{formatElapsed(elapsed)}</span>
        </div>
      )}

      {pendingRun && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold-700/50 bg-gold-900/10 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-gold-200">
              Run paused at: {pendingRun.step ?? "next step"}
            </p>
            <p className="text-xs text-muted-foreground">
              It stopped mid-pipeline. Resume picks up from the last saved step.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="gold" onClick={() => drive(pendingRun.id, pendingRun.step ?? "Resuming")}>
              <Play className="h-3.5 w-3.5" />
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={stopping}
              onClick={() =>
                startStop(async () => {
                  await stopRun(pendingRun.id, clientId);
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

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
