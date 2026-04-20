"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  UsersRound,
  Settings,
} from "lucide-react";
import { HBLogo } from "@/components/hb-logo";
import { PulseDot } from "@/components/pulse-dot";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  role: "admin" | "member";
  userName: string;
  userEmail: string;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const items: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline",  label: "Pipeline",  icon: KanbanSquare },
  { href: "/leads",     label: "Leads",     icon: Users },
  { href: "/team",      label: "Team",      icon: UsersRound, adminOnly: true },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export function SidebarNav({ role, userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex h-16 items-center gap-2 border-b border-ink-700 px-5">
        <HBLogo showWordmark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </p>
        <ul className="space-y-1">
          {items
            .filter((i) => !i.adminOnly || role === "admin")
            .map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-ink-850 text-foreground shadow-[inset_2px_0_0_0_#dc2626]"
                        : "text-muted-foreground hover:bg-ink-850 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 transition-colors",
                        active
                          ? "text-crimson-500"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      <div className="border-t border-ink-700 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-700 bg-ink-850 text-xs font-semibold text-foreground">
            {initials(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {userName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <PulseDot
            label={role === "admin" ? "Admin" : "Member"}
            variant={role === "admin" ? "crimson" : "gold"}
          />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-crimson-500"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "HB";
}
