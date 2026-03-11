import { useSyncExternalStore } from "react";

export type PersistentUserDefaults = {
  lastProjectId: string | null;
  lastMicrophoneId: string | null;
  captureSystemAudio: boolean;
  countdownSeconds: number;
  openBrowserAfterUpload: boolean;
  copyShareLinkAfterUpload: boolean;
};

export const DEFAULT_USER_DEFAULTS: PersistentUserDefaults = {
  lastProjectId: null,
  lastMicrophoneId: null,
  captureSystemAudio: false,
  countdownSeconds: 0,
  openBrowserAfterUpload: true,
  copyShareLinkAfterUpload: true,
};

const STORAGE_KEY = "loam.desktop.user-defaults.v1";

type Listener = () => void;

let cachedDefaults = DEFAULT_USER_DEFAULTS;
const listeners = new Set<Listener>();

function clampCountdownSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_USER_DEFAULTS.countdownSeconds;
  }

  return Math.min(10, Math.max(0, Math.round(value)));
}

function sanitizeDefaults(value: unknown): PersistentUserDefaults {
  if (!value || typeof value !== "object") {
    return DEFAULT_USER_DEFAULTS;
  }

  const candidate = value as Partial<PersistentUserDefaults>;

  return {
    lastProjectId:
      typeof candidate.lastProjectId === "string" ? candidate.lastProjectId : null,
    lastMicrophoneId:
      typeof candidate.lastMicrophoneId === "string" ? candidate.lastMicrophoneId : null,
    captureSystemAudio:
      typeof candidate.captureSystemAudio === "boolean"
        ? candidate.captureSystemAudio
        : DEFAULT_USER_DEFAULTS.captureSystemAudio,
    countdownSeconds: clampCountdownSeconds(candidate.countdownSeconds),
    openBrowserAfterUpload:
      typeof candidate.openBrowserAfterUpload === "boolean"
        ? candidate.openBrowserAfterUpload
        : DEFAULT_USER_DEFAULTS.openBrowserAfterUpload,
    copyShareLinkAfterUpload:
      typeof candidate.copyShareLinkAfterUpload === "boolean"
        ? candidate.copyShareLinkAfterUpload
        : DEFAULT_USER_DEFAULTS.copyShareLinkAfterUpload,
  };
}

function readStoredDefaults() {
  if (typeof window === "undefined") {
    return cachedDefaults;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_USER_DEFAULTS;
  }

  try {
    return sanitizeDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_DEFAULTS;
  }
}

function writeStoredDefaults(next: PersistentUserDefaults) {
  cachedDefaults = next;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  cachedDefaults = readStoredDefaults();
  return cachedDefaults;
}

export function usePersistentUserDefaults() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_USER_DEFAULTS);
}

export function updateUserDefaults(
  updates:
    | Partial<PersistentUserDefaults>
    | ((current: PersistentUserDefaults) => PersistentUserDefaults),
) {
  const current = readStoredDefaults();
  const next =
    typeof updates === "function" ? updates(current) : { ...current, ...updates };

  writeStoredDefaults(sanitizeDefaults(next));
}
