"use client";

import type { ReactNode } from "react";

import { ClerkClientProvider } from "@/lib/clerk";
import { ConvexClientProvider } from "@/lib/convex";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkClientProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkClientProvider>
  );
}
