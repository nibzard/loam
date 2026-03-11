import assert from "node:assert/strict";
import test from "node:test";

import {
  planPublicPlaybackAccess,
  planSignedPlaybackAccess,
} from "./playbackAccess";

test("planPublicPlaybackAccess syncs the poster thumbnail only for public videos", () => {
  assert.deepEqual(
    planPublicPlaybackAccess({
      publicPlaybackId: "playback_public_123",
      target: {
        thumbnailUrl: null,
        visibility: "public",
      },
    }),
    {
      thumbnailUrl:
        "https://image.mux.com/playback_public_123/thumbnail.jpg?time=0",
    },
  );

  assert.deepEqual(
    planPublicPlaybackAccess({
      publicPlaybackId: "playback_public_123",
      target: {
        thumbnailUrl:
          "https://image.mux.com/playback_public_123/thumbnail.jpg?time=0",
        visibility: "public",
      },
    }),
    {
      thumbnailUrl: undefined,
    },
  );

  assert.deepEqual(
    planPublicPlaybackAccess({
      publicPlaybackId: "playback_public_123",
      target: {
        thumbnailUrl: "https://cdn.example.com/custom.jpg",
        visibility: "private",
      },
    }),
    {
      thumbnailUrl: undefined,
    },
  );
});

test("planSignedPlaybackAccess removes public playback for private videos and patches stale signed ids", () => {
  assert.deepEqual(
    planSignedPlaybackAccess({
      publicPlaybackIds: ["public_a", "public_b"],
      signedPlaybackId: "signed_current",
      target: {
        muxPlaybackId: "signed_old",
        thumbnailUrl: "https://image.mux.com/public_a/thumbnail.jpg?time=0",
        visibility: "private",
      },
    }),
    {
      muxPlaybackId: "signed_current",
      publicPlaybackIdsToDelete: ["public_a", "public_b"],
      thumbnailUrl: null,
    },
  );
});

test("planSignedPlaybackAccess preserves public playback state for public videos", () => {
  assert.deepEqual(
    planSignedPlaybackAccess({
      publicPlaybackIds: ["public_a"],
      signedPlaybackId: "signed_current",
      target: {
        muxPlaybackId: "signed_current",
        thumbnailUrl: "https://image.mux.com/public_a/thumbnail.jpg?time=0",
        visibility: "public",
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
        target: {
          visibility: "private",
        },
      }),
    /Signed playback is not configured/,
  );
});
