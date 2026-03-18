type PlaybackAccessTarget = {
  muxPlaybackId?: string | null;
  thumbnailUrl?: string | null;
};

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
    publicPlaybackIdsToDelete: args.publicPlaybackIds,
    thumbnailUrl: args.target.thumbnailUrl ? null : undefined,
  };
}
