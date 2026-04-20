import { cn } from "@/lib/utils";

interface HBLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

/**
 * Hades Blueprint monogram.
 * Stacked H/B glyph in a rounded square with a crimson slash —
 * reads as "HB" while evoking the blueprint/architect feel.
 */
export function HBLogo({
  className,
  size = 28,
  showWordmark = false,
}: HBLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="7"
          fill="#0a0a0a"
          stroke="#2a2a2a"
          strokeWidth="1.25"
        />
        {/* H */}
        <path
          d="M8 9V23M8 16H14M14 9V23"
          stroke="#f5f5f5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* B */}
        <path
          d="M18 9V23H22.5C24.4 23 26 21.6 26 19.7C26 18.1 25 17 23.7 16.6C24.8 16.2 25.5 15.2 25.5 13.9C25.5 12.2 24.1 9 22.3 9H18Z"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
          Hades<span className="text-crimson-500">.</span>Blueprint
        </span>
      )}
    </div>
  );
}
