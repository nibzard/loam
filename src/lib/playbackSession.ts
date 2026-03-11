export const PLAYBACK_SESSION_REFRESH_LEAD_MS = 60 * 1000;
export const PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS = 5 * 1000;

export type PlaybackSession = {
  accessMode: "public" | "signed";
  expiresAt: number | null;
  posterUrl: string;
  url: string;
};
