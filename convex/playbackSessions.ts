"use node";

import { buildMuxPlaybackUrl, buildMuxThumbnailUrl } from "./mux";

export const SIGNED_PLAYBACK_SESSION_TTL = "15m";
export const SIGNED_PLAYBACK_SESSION_TTL_MS = 15 * 60 * 1000;

export type PlaybackSessionAccessMode = "public" | "signed";

export type PlaybackSession = {
  accessMode: PlaybackSessionAccessMode;
  expiresAt: number | null;
  posterUrl: string;
  url: string;
};

type PlaybackIdEntry = {
  id?: string;
  policy?: string;
};

export function resolveMuxPlaybackIds(
  playbackIds: Array<PlaybackIdEntry> | null | undefined,
) {
  const publicPlaybackIds =
    playbackIds
      ?.filter((entry) => entry.policy === "public" && typeof entry.id === "string")
      .map((entry) => entry.id as string) ?? [];
  const signedPlaybackIds =
    playbackIds
      ?.filter((entry) => entry.policy === "signed" && typeof entry.id === "string")
      .map((entry) => entry.id as string) ?? [];

  return {
    publicPlaybackId: publicPlaybackIds[0] ?? null,
    publicPlaybackIds,
    signedPlaybackId: signedPlaybackIds[0] ?? null,
    signedPlaybackIds,
  };
}

export function buildPublicPlaybackSession(playbackId: string): PlaybackSession {
  return {
    accessMode: "public",
    expiresAt: null,
    url: buildMuxPlaybackUrl(playbackId),
    posterUrl: buildMuxThumbnailUrl(playbackId),
  };
}

export function buildSignedPlaybackSession(args: {
  playbackId: string;
  playbackToken: string;
  thumbnailToken: string;
  now?: number;
}): PlaybackSession {
  const issuedAt = args.now ?? Date.now();
  return {
    accessMode: "signed",
    expiresAt: issuedAt + SIGNED_PLAYBACK_SESSION_TTL_MS,
    url: buildMuxPlaybackUrl(args.playbackId, args.playbackToken),
    posterUrl: buildMuxThumbnailUrl(args.playbackId, args.thumbnailToken),
  };
}
