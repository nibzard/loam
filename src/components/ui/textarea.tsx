import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
        <textarea
        className={cn(
          "flex min-h-[80px] w-full border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] font-mono transition-all placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:ring-0 focus-visible:border-[var(--accent)] focus-visible:shadow-[4px_4px_0px_0px_var(--shadow-accent)] disabled:cursor-not-allowed disabled:opacity-40 resize-none",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
