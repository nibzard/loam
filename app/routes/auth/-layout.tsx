import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] relative">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <span className="text-4xl font-black text-[var(--foreground)]">loam</span>
          </Link>
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">
            Async video sharing, simplified
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthShell;
