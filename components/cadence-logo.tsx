import { cn } from "@/lib/utils";

interface CadenceLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

/**
 * Cadence GTM mark.
 * Four rising bars in a rounded square: a sequence, step by step,
 * with the last beat in crimson. Reads as rhythm and as a growth chart.
 */
export function CadenceLogo({
  className,
  size = 28,
  showWordmark = false,
}: CadenceLogoProps) {
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
        <path
          d="M8.5 22V19M13 22V15.5M17.5 22V12"
          stroke="#f5f5f5"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <path
          d="M22.5 22V8.5"
          stroke="#dc2626"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
          Cadence<span className="text-crimson-500">.</span>GTM
        </span>
      )}
    </div>
  );
}
