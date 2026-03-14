"use client";

import { useSyncExternalStore } from "react";
import type { useUser } from "@clerk/tanstack-react-start";

type PublicViewer = ReturnType<typeof useUser>["user"];

type PublicViewerAuthSnapshot = {
  isLoaded: boolean;
  user: PublicViewer;
};

const DEFAULT_SNAPSHOT: PublicViewerAuthSnapshot = {
  isLoaded: false,
  user: null,
};

let snapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function setPublicViewerAuthSnapshot(
  nextSnapshot: PublicViewerAuthSnapshot,
) {
  const sameUser = snapshot.user?.id === nextSnapshot.user?.id;
  if (snapshot.isLoaded === nextSnapshot.isLoaded && sameUser) {
    return;
  }

  snapshot = nextSnapshot;
  emit();
}

export function resetPublicViewerAuthSnapshot() {
  if (snapshot.isLoaded === DEFAULT_SNAPSHOT.isLoaded && snapshot.user === DEFAULT_SNAPSHOT.user) {
    return;
  }

  snapshot = DEFAULT_SNAPSHOT;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function usePublicViewerAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
