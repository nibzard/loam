import type { ReactNode } from "react";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen font-mono bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)] selection:text-[var(--foreground-inverse)]"
    >
      <MarketingNav />
      <main className="pt-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}
