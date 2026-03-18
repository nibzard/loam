import assert from "node:assert/strict";
import test from "node:test";

import { planSignedPlaybackAccess } from "./playbackAccess";

test("planSignedPlaybackAccess removes stale public playback and clears cached thumbnails", () => {
  assert.deepEqual(
    planSignedPlaybackAccess({
      publicPlaybackIds: ["public_a", "public_b"],
      signedPlaybackId: "signed_current",
      target: {
        muxPlaybackId: "signed_old",
        thumbnailUrl: "https://image.mux.com/public_a/thumbnail.jpg?time=0",
      },
    }),
    {
      muxPlaybackId: "signed_current",
      publicPlaybackIdsToDelete: ["public_a", "public_b"],
      thumbnailUrl: null,
    },
  );
});

test("planSignedPlaybackAccess keeps signed playback when nothing changed", () => {
  assert.deepEqual(
    planSignedPlaybackAccess({
      publicPlaybackIds: [],
      signedPlaybackId: "signed_current",
      target: {
        muxPlaybackId: "signed_current",
      },
    }),
    {
      muxPlaybackId: undefined,
      publicPlaybackIdsToDelete: [],
      thumbnailUrl: undefined,
    },
  );
});

test("planSignedPlaybackAccess requires a signed playback id", () => {
  assert.throws(
    () =>
      planSignedPlaybackAccess({
        publicPlaybackIds: [],
        signedPlaybackId: null,
        target: {},
      }),
    /Signed playback is not configured/,
  );
});
