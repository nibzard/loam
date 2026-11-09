export const PLAYBACK_SESSION_REFRESH_LEAD_MS = 60 * 1000;
export const PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS = 5 * 1000;
export const PLAYBACK_SESSION_REFRESH_RETRY_MS = 10 * 1000;
export const PLAYBACK_SESSION_REFRESH_RETRY_MAX_MS = 60 * 1000;

export type PlaybackSession = {
  accessMode: "public" | "signed";
  expiresAt: number | null;
  posterUrl: string;
  url: string;
};

type RefreshablePlaybackSession = Pick<
  PlaybackSession,
  "accessMode" | "expiresAt"
>;

// Delay before a signed session must refresh, or null when no scheduled
// refresh applies. Unsigned sessions and sessions without an expiry never
// need one, and a session already inside the refresh lead refreshes now.
export function playbackSessionRefreshDelayMs(
  session: RefreshablePlaybackSession | null | undefined,
  now: number,
  leadMs: number = PLAYBACK_SESSION_REFRESH_LEAD_MS,
): number | null {
  if (
    !session ||
    session.accessMode !== "signed" ||
    session.expiresAt === null
  ) {
    return null;
  }

  return Math.max(0, session.expiresAt - now - leadMs);
}

// Backoff between retries after a failed session refresh. The first retry
// waits the base delay, each further failure doubles the wait, and the cap
// keeps a dead session from spinning the client. The player only reports an
// access error once per source, so a failed refresh needs its own retry.
export function playbackSessionRetryDelayMs(
  failureCount: number,
  baseMs: number = PLAYBACK_SESSION_REFRESH_RETRY_MS,
  maxMs: number = PLAYBACK_SESSION_REFRESH_RETRY_MAX_MS,
): number {
  const failures = Math.max(1, Math.floor(failureCount));
  return Math.min(maxMs, baseMs * 2 ** (failures - 1));
}
