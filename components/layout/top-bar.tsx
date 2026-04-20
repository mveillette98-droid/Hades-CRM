"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-ink-700 bg-ink-950/80 px-8 backdrop-blur">
      <h1 className="font-display text-lg font-semibold tracking-tight">
        {title}
      </h1>
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search leads, companies, contacts…"
          className="h-9 pl-9"
          aria-label="Search"
        />
      </div>
    </header>
  );
}
