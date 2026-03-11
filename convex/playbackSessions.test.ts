import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicPlaybackSession,
  buildSignedPlaybackSession,
  resolveMuxPlaybackIds,
  SIGNED_PLAYBACK_SESSION_TTL_MS,
} from "./playbackSessions";

test("resolveMuxPlaybackIds separates public and signed ids", () => {
  const result = resolveMuxPlaybackIds([
    { id: "public_1", policy: "public" },
    { id: "signed_1", policy: "signed" },
    { id: "signed_2", policy: "signed" },
    { id: "ignored", policy: "drm" },
    {},
  ]);

  assert.equal(result.publicPlaybackId, "public_1");
  assert.deepEqual(result.publicPlaybackIds, ["public_1"]);
  assert.equal(result.signedPlaybackId, "signed_1");
  assert.deepEqual(result.signedPlaybackIds, ["signed_1", "signed_2"]);
});

test("buildPublicPlaybackSession produces a non-expiring public session", () => {
  const session = buildPublicPlaybackSession("playback_public");

  assert.equal(session.accessMode, "public");
  assert.equal(session.expiresAt, null);
  assert.equal(
    session.url,
    "https://stream.mux.com/playback_public.m3u8?min_resolution=720p&max_resolution=720p",
  );
  assert.equal(
    session.posterUrl,
    "https://image.mux.com/playback_public/thumbnail.jpg?time=0",
  );
});

test("buildSignedPlaybackSession includes signed urls and an explicit expiry", () => {
  const session = buildSignedPlaybackSession({
    playbackId: "playback_signed",
    playbackToken: "video-token",
    thumbnailToken: "thumb-token",
    now: 1_700_000_000_000,
  });

  assert.equal(session.accessMode, "signed");
  assert.equal(session.expiresAt, 1_700_000_000_000 + SIGNED_PLAYBACK_SESSION_TTL_MS);
  assert.equal(
    session.url,
    "https://stream.mux.com/playback_signed.m3u8?min_resolution=720p&max_resolution=720p&token=video-token",
  );
  assert.equal(
    session.posterUrl,
    "https://image.mux.com/playback_signed/thumbnail.jpg?time=0&token=thumb-token",
  );
});
