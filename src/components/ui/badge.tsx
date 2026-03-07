import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center px-2 py-0.5 text-xs font-bold uppercase tracking-wider transition-colors border-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--foreground)] text-[var(--foreground-inverse)] border-[var(--border)]",
        secondary:
          "bg-[var(--surface-alt)] text-[var(--foreground)] border-[var(--border)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--foreground-inverse)] border-[var(--destructive)]",
        outline:
          "border-[var(--border)] text-[var(--foreground)] bg-transparent",
        success:
          "bg-[var(--accent)] text-[var(--foreground-inverse)] border-[var(--accent)]",
        warning:
          "bg-[var(--warning)] text-[var(--foreground-inverse)] border-[var(--warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
