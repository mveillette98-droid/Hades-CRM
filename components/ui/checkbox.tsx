"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Lightweight dark-theme checkbox. No Radix dep.
 * Supports an `indeterminate` state for "some selected" master toggles.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const isIndeterminate = checked === "indeterminate";
  const isChecked = checked === true;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndeterminate ? "mixed" : isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange(!isChecked);
      }}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-950",
        isChecked || isIndeterminate
          ? "border-crimson-600 bg-crimson-600 text-white"
          : "border-ink-600 bg-ink-900 hover:border-ink-500",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {isIndeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : isChecked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
