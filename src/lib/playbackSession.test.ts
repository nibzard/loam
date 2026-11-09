import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYBACK_SESSION_REFRESH_LEAD_MS,
  PLAYBACK_SESSION_REFRESH_RETRY_MAX_MS,
  PLAYBACK_SESSION_REFRESH_RETRY_MS,
  playbackSessionRefreshDelayMs,
  playbackSessionRetryDelayMs,
  type PlaybackSession,
} from "./playbackSession";

function signedSession(expiresAt: number | null): PlaybackSession {
  return {
    accessMode: "signed",
    expiresAt,
    posterUrl: "https://image.mux.com/p/thumbnail.jpg",
    url: "https://stream.mux.com/p.m3u8?token=t",
  };
}

test("schedules no refresh without a signed session or expiry", () => {
  const now = 1_000_000;

  assert.equal(playbackSessionRefreshDelayMs(null, now), null);
  assert.equal(playbackSessionRefreshDelayMs(undefined, now), null);
  assert.equal(
    playbackSessionRefreshDelayMs(
      { ...signedSession(now + 30_000), accessMode: "public" },
      now,
    ),
    null,
  );
  assert.equal(playbackSessionRefreshDelayMs(signedSession(null), now), null);
});

test("refreshes immediately once the session reaches the refresh lead", () => {
  const now = 1_000_000;

  const insideLead = now + PLAYBACK_SESSION_REFRESH_LEAD_MS - 1_000;
  assert.equal(
    playbackSessionRefreshDelayMs(signedSession(insideLead), now),
    0,
  );

  const expiredSession = now - 1_000;
  assert.equal(
    playbackSessionRefreshDelayMs(signedSession(expiredSession), now),
    0,
  );
});

test("schedules the remaining time minus the refresh lead", () => {
  const now = 1_000_000;
  const expiresAt = now + PLAYBACK_SESSION_REFRESH_LEAD_MS + 45_000;

  assert.equal(
    playbackSessionRefreshDelayMs(signedSession(expiresAt), now),
    45_000,
  );
  assert.equal(
    playbackSessionRefreshDelayMs(signedSession(expiresAt), now, 30_000),
    PLAYBACK_SESSION_REFRESH_LEAD_MS + 45_000 - 30_000,
  );
});

test("retry backoff doubles per failure and caps out", () => {
  assert.equal(playbackSessionRetryDelayMs(1), PLAYBACK_SESSION_REFRESH_RETRY_MS);
  assert.equal(
    playbackSessionRetryDelayMs(2),
    PLAYBACK_SESSION_REFRESH_RETRY_MS * 2,
  );
  assert.equal(
    playbackSessionRetryDelayMs(3),
    PLAYBACK_SESSION_REFRESH_RETRY_MS * 4,
  );
  assert.equal(
    playbackSessionRetryDelayMs(99),
    PLAYBACK_SESSION_REFRESH_RETRY_MAX_MS,
  );
});

test("retry backoff clamps invalid failure counts to the base delay", () => {
  assert.equal(playbackSessionRetryDelayMs(0), PLAYBACK_SESSION_REFRESH_RETRY_MS);
  assert.equal(playbackSessionRetryDelayMs(-4), PLAYBACK_SESSION_REFRESH_RETRY_MS);
  assert.equal(playbackSessionRetryDelayMs(1.9), PLAYBACK_SESSION_REFRESH_RETRY_MS);
});
