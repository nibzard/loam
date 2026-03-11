import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSupportsNativeHls,
  isHlsPlaybackSource,
  shouldLoadHlsJsForSource,
} from "./muxPlayback";

test("detects HLS playback manifests", () => {
  assert.equal(isHlsPlaybackSource("https://stream.mux.com/abc.m3u8"), true);
  assert.equal(isHlsPlaybackSource("https://cdn.example.com/video.mp4"), false);
});

test("recognizes native HLS support from the media element", () => {
  const nativeVideo = {
    canPlayType(type: string) {
      return type === "application/vnd.apple.mpegurl" ? "probably" : "";
    },
  };

  const nonNativeVideo = {
    canPlayType() {
      return "";
    },
  };

  assert.equal(browserSupportsNativeHls(nativeVideo), true);
  assert.equal(browserSupportsNativeHls(nonNativeVideo), false);
});

test("only loads hls.js when the source is HLS and native playback is unavailable", () => {
  const nativeVideo = {
    canPlayType() {
      return "maybe";
    },
  };

  const nonNativeVideo = {
    canPlayType() {
      return "";
    },
  };

  assert.equal(
    shouldLoadHlsJsForSource("https://stream.mux.com/abc.m3u8", nativeVideo),
    false,
  );
  assert.equal(
    shouldLoadHlsJsForSource("https://stream.mux.com/abc.m3u8", nonNativeVideo),
    true,
  );
  assert.equal(
    shouldLoadHlsJsForSource("https://cdn.example.com/video.mp4", nonNativeVideo),
    false,
  );
});
