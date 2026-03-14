"use client";

import type { ReactNode } from "react";

import { ClerkClientProvider } from "@/lib/clerk";
import { ConvexClientProvider, ConvexPublicClientProvider } from "@/lib/convex";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkClientProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkClientProvider>
  );
}

export function PublicAppProviders({ children }: { children: ReactNode }) {
  return <ConvexPublicClientProvider>{children}</ConvexPublicClientProvider>;
}
