import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoPosterCacheKey,
  cacheVideoPosterUrls,
  getCachedVideoPosterUrls,
  getVideoPosterFallbackUrl,
  type CacheableVideoPoster,
} from "./videoPosterCache";

function createStorage() {
  const state = new Map<string, string>();

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function createVideo(overrides: Partial<CacheableVideoPoster> & { _id: string }): CacheableVideoPoster {
  return {
    _id: overrides._id,
    muxPlaybackId: overrides.muxPlaybackId ?? null,
    status: overrides.status ?? "ready",
    thumbnailUrl: overrides.thumbnailUrl,
  };
}

test("public videos use their stable thumbnail URL immediately", () => {
  const video = createVideo({
    _id: "video_public",
    thumbnailUrl: "https://image.mux.com/public/thumb.jpg",
  });

  assert.equal(getVideoPosterFallbackUrl(video), "https://image.mux.com/public/thumb.jpg");
  assert.equal(buildVideoPosterCacheKey(video), null);
  assert.deepEqual(getCachedVideoPosterUrls({ videos: [video] }), {
    video_public: "https://image.mux.com/public/thumb.jpg",
  });
});

test("private videos reuse cached signed poster URLs until expiry", () => {
  const storage = createStorage();
  const now = 1_000;
  const video = createVideo({
    _id: "video_private",
    muxPlaybackId: "mux_private_123",
  });

  cacheVideoPosterUrls({
    now,
    posters: [
      {
        expiresAt: now + 10_000,
        posterUrl: "https://image.mux.com/private/thumb.jpg?token=abc",
        videoId: "video_private",
      },
    ],
    storage,
    videosById: new Map([[video._id, video]]),
  });

  assert.deepEqual(
    getCachedVideoPosterUrls({
      now: now + 1_000,
      storage,
      videos: [video],
    }),
    {
      video_private: "https://image.mux.com/private/thumb.jpg?token=abc",
    },
  );
});

test("expired private poster entries are ignored and pruned", () => {
  const storage = createStorage();
  const now = 5_000;
  const video = createVideo({
    _id: "video_private",
    muxPlaybackId: "mux_private_456",
  });

  cacheVideoPosterUrls({
    now,
    posters: [
      {
        expiresAt: now + 500,
        posterUrl: "https://image.mux.com/private/thumb.jpg?token=soon-expired",
        videoId: "video_private",
      },
    ],
    storage,
    videosById: new Map([[video._id, video]]),
  });

  assert.deepEqual(
    getCachedVideoPosterUrls({
      now: now + 1_000,
      storage,
      videos: [video],
    }),
    {},
  );
  assert.equal(storage.getItem("loam.videoPosterCache.v1"), null);
});

test("cache writes ignore non-cacheable poster responses", () => {
  const storage = createStorage();
  const now = 10_000;
  const video = createVideo({
    _id: "video_public",
    thumbnailUrl: "https://image.mux.com/public/thumb.jpg",
  });

  cacheVideoPosterUrls({
    now,
    posters: [
      {
        expiresAt: null,
        posterUrl: "https://image.mux.com/public/thumb.jpg",
        videoId: "video_public",
      },
    ],
    storage,
    videosById: new Map([[video._id, video]]),
  });

  assert.equal(storage.getItem("loam.videoPosterCache.v1"), null);
});
