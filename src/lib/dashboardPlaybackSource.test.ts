import assert from "node:assert/strict";
import test from "node:test";

import { selectDashboardPlaybackUrl } from "./dashboardPlaybackSource";

test("waits for the 720p session when Mux playback is ready", () => {
  assert.equal(
    selectDashboardPlaybackUrl({
      preferredSource: "mux720",
      muxPlaybackReady: true,
      muxUrl: null,
      originalUrl: "https://storage.example/original.mov",
    }),
    null,
  );
});

test("uses 720p by default once its session is available", () => {
  assert.equal(
    selectDashboardPlaybackUrl({
      preferredSource: "mux720",
      muxPlaybackReady: true,
      muxUrl: "https://stream.example/video.m3u8",
      originalUrl: "https://storage.example/original.mov",
    }),
    "https://stream.example/video.m3u8",
  );
});

test("falls back to the original while Mux is still processing", () => {
  assert.equal(
    selectDashboardPlaybackUrl({
      preferredSource: "mux720",
      muxPlaybackReady: false,
      muxUrl: null,
      originalUrl: "https://storage.example/original.mov",
    }),
    "https://storage.example/original.mov",
  );
});

test("honors an explicit Original selection", () => {
  assert.equal(
    selectDashboardPlaybackUrl({
      preferredSource: "original",
      muxPlaybackReady: true,
      muxUrl: "https://stream.example/video.m3u8",
      originalUrl: "https://storage.example/original.mov",
    }),
    "https://storage.example/original.mov",
  );
});
