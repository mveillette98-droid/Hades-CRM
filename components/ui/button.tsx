import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-crimson-600 text-white hover:bg-crimson-500 shadow-[0_0_0_1px_rgba(220,38,38,0.45)] hover:shadow-glow-crimson",
        destructive:
          "bg-red-900/60 text-red-100 hover:bg-red-800/80 border border-red-800",
        outline:
          "border border-ink-700 bg-transparent text-foreground hover:border-crimson-600/60 hover:bg-ink-850 hover:text-foreground",
        secondary:
          "bg-ink-850 text-foreground border border-ink-700 hover:bg-ink-800",
        ghost: "text-muted-foreground hover:bg-ink-850 hover:text-foreground",
        link: "text-crimson-500 underline-offset-4 hover:underline",
        gold: "bg-gold-500 text-ink-950 hover:bg-gold-400 font-semibold",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
