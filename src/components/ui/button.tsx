import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold uppercase tracking-wider transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-[2px] active:translate-x-[2px]",
  {
      variants: {
      variant: {
        default:
          "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--accent)] hover:text-[var(--background)] border-2 border-[var(--border)] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        primary:
          "bg-[var(--accent)] text-[var(--background)] hover:bg-[var(--accent-hover)] hover:text-[var(--background)] border-2 border-[var(--accent)] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--background)] hover:bg-[var(--destructive)] hover:text-[var(--background)] border-2 border-[var(--destructive)] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        outline:
          "border-2 border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground-inverse)] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        secondary:
          "bg-[var(--surface-alt)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] border-2 border-[var(--border)] shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)]",
        ghost:
          "text-[var(--foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground-inverse)] border-2 border-transparent hover:border-[var(--border)] hover:shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:-translate-y-[2px] hover:-translate-x-[2px]",
        link:
          "text-[var(--foreground)] underline underline-offset-4 hover:text-[var(--accent)]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
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
