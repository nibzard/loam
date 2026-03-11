"use client";

import { useUser } from "@clerk/tanstack-react-start";
import { startTransition, useEffect, useState } from "react";

import { ClerkClientProvider } from "@/lib/clerk";
import { ConvexClientProvider } from "@/lib/convex";
import {
  resetPublicViewerAuthSnapshot,
  setPublicViewerAuthSnapshot,
} from "@/lib/publicViewerAuth";

export function DeferredPublicAuthBridge({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setMounted(false);
      resetPublicViewerAuthSnapshot();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      startTransition(() => {
        setMounted(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!mounted) {
    return null;
  }

  return (
    <ClerkClientProvider>
      <ConvexClientProvider>
        <PublicAuthReporter />
      </ConvexClientProvider>
    </ClerkClientProvider>
  );
}

function PublicAuthReporter() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    setPublicViewerAuthSnapshot({ user, isLoaded });

    return () => {
      resetPublicViewerAuthSnapshot();
    };
  }, [isLoaded, user]);

  return null;
}
