import { buildPublicPlaybackSession } from "./playbackSessions";

type PlaybackAccessTarget = {
  muxPlaybackId?: string | null;
  thumbnailUrl?: string | null;
  visibility: "public" | "private";
};

export function planPublicPlaybackAccess(args: {
  publicPlaybackId: string;
  target: Pick<PlaybackAccessTarget, "thumbnailUrl" | "visibility">;
}) {
  const session = buildPublicPlaybackSession(args.publicPlaybackId);

  return {
    thumbnailUrl:
      args.target.visibility === "public" && args.target.thumbnailUrl !== session.posterUrl
        ? session.posterUrl
        : undefined,
  };
}

export function planSignedPlaybackAccess(args: {
  publicPlaybackIds: string[];
  signedPlaybackId: string | null;
  target: PlaybackAccessTarget;
}) {
  if (!args.signedPlaybackId) {
    throw new Error("Signed playback is not configured for this video");
  }

  return {
    muxPlaybackId:
      args.signedPlaybackId !== args.target.muxPlaybackId ? args.signedPlaybackId : undefined,
    publicPlaybackIdsToDelete:
      args.target.visibility === "private" ? args.publicPlaybackIds : [],
    thumbnailUrl:
      args.target.visibility === "private" && args.target.thumbnailUrl ? null : undefined,
  };
}
