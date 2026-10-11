import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/outbound", label: "Campaigns & replies" },
  { href: "/outbound/setup", label: "Setup" },
];

export function OutboundTabs({ active, setupIssues }: { active: "/outbound" | "/outbound/setup"; setupIssues?: number }) {
  return (
    <nav className="flex gap-1 border-b border-ink-700">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            active === t.href ? "border-crimson-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
          {t.href === "/outbound/setup" && !!setupIssues && (
            <span className="ml-2 rounded-full bg-crimson-900/40 px-1.5 py-0.5 text-[10px] text-crimson-200">{setupIssues}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
