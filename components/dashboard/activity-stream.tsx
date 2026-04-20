import Link from "next/link";
import {
  Activity as ActivityIcon,
  ArrowRight,
  MessageSquare,
  Plus,
  Pencil,
  UserPlus,
  Trash2,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecentActivity } from "@/lib/leads/queries";

interface ActivityStreamProps {
  items: RecentActivity[];
  stageNameById: Record<string, string>;
}

export function ActivityStream({ items, stageNameById }: ActivityStreamProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ActivityIcon className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No activity yet. Log a call, change a stage, add a note.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const { icon: Icon, tone } = iconFor(a.action);
        return (
          <li key={a.id} className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                tone
              )}
            >
              <Icon className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                <span className="font-medium">
                  {userLabel(a.user)}
                </span>{" "}
                <span className="text-muted-foreground">
                  {verbFor(a, stageNameById)}
                </span>{" "}
                {a.lead && (
                  <Link
                    href={`/leads/${a.lead.id}`}
                    className="font-medium text-foreground hover:text-crimson-400"
                  >
                    {a.lead.company_name}
                  </Link>
                )}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {timeAgo(a.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function userLabel(
  user: RecentActivity["user"]
): string {
  if (!user) return "Someone";
  return user.full_name || user.email.split("@")[0] || "User";
}

function verbFor(
  a: RecentActivity,
  stageNameById: Record<string, string>
): string {
  switch (a.action) {
    case "lead.created":
      return "added";
    case "lead.stage_changed": {
      const to = (a.details as { to?: string } | null)?.to;
      const from = (a.details as { from?: string } | null)?.from;
      if (to && from) {
        return `moved ${stageNameById[from] ?? "stage"} → ${stageNameById[to] ?? "stage"} on`;
      }
      if (to) return `moved to ${stageNameById[to] ?? "new stage"} —`;
      return "moved";
    }
    case "lead.reassigned":
      return "reassigned";
    case "lead.updated":
      return "updated";
    case "lead.deleted":
      return "deleted";
    case "note.added":
      return "left a note on";
    default:
      return a.action.replace(/[_.]/g, " ");
  }
}

function iconFor(action: string): {
  icon: typeof ActivityIcon;
  tone: string;
} {
  switch (action) {
    case "lead.created":
      return {
        icon: Plus,
        tone: "border-crimson-700 bg-crimson-950/40 text-crimson-300",
      };
    case "lead.stage_changed":
      return {
        icon: ArrowRight,
        tone: "border-gold-700 bg-gold-500/10 text-gold-300",
      };
    case "lead.reassigned":
      return {
        icon: UserPlus,
        tone: "border-ink-600 bg-ink-800 text-foreground",
      };
    case "lead.updated":
      return {
        icon: Pencil,
        tone: "border-ink-700 bg-ink-900 text-muted-foreground",
      };
    case "lead.deleted":
      return {
        icon: Trash2,
        tone: "border-crimson-800 bg-crimson-950/40 text-crimson-300",
      };
    case "note.added":
      return {
        icon: MessageSquare,
        tone: "border-ink-700 bg-ink-900 text-foreground",
      };
    default:
      return {
        icon: Flag,
        tone: "border-ink-700 bg-ink-900 text-muted-foreground",
      };
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
