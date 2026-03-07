import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
        <input
        type={type}
        className={cn(
          "flex h-10 w-full border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] font-mono transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:ring-0 focus-visible:border-[var(--accent)] focus-visible:shadow-[4px_4px_0px_0px_var(--shadow-accent)] disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
