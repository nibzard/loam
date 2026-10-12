import assert from "node:assert/strict";
import test from "node:test";

import {
  getMissingPosterVideoIds,
  pruneFetchedPosterEntries,
} from "./useProjectVideoPosterUrls";

function createVideo(overrides: {
  _id: string;
  muxPlaybackId?: string | null;
  status?: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl?: string | null;
}) {
  return {
    _id: overrides._id as never,
    muxPlaybackId: overrides.muxPlaybackId ?? null,
    status: overrides.status ?? "ready",
    thumbnailUrl: overrides.thumbnailUrl,
  };
}

test("pruneFetchedPosterEntries drops stale entries when playback ids change", () => {
  const previous = {
    video_1: {
      muxPlaybackId: "playback_old",
      posterUrl: "https://image.mux.com/playback_old/thumbnail.jpg",
    },
  };

  const next = pruneFetchedPosterEntries({
    previous,
    videos: [
      createVideo({
        _id: "video_1",
        muxPlaybackId: "playback_new",
      }),
    ],
  });

  assert.deepEqual(next, {});
});

test("getMissingPosterVideoIds refetches when a video keeps the same id but gets a new playback id", () => {
  const missing = getMissingPosterVideoIds({
    cachedPosterUrls: {},
    fetchedPosterEntries: {
      video_1: {
        muxPlaybackId: "playback_old",
        posterUrl: "https://image.mux.com/playback_old/thumbnail.jpg",
      },
    },
    videos: [
      createVideo({
        _id: "video_1",
        muxPlaybackId: "playback_new",
      }),
    ],
  });

  assert.deepEqual(missing, ["video_1"]);
});

test("getMissingPosterVideoIds skips videos with stable fallback thumbnails", () => {
  const missing = getMissingPosterVideoIds({
    cachedPosterUrls: {},
    fetchedPosterEntries: {},
    videos: [
      createVideo({
        _id: "video_public",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      }),
    ],
  });

  assert.deepEqual(missing, []);
});

