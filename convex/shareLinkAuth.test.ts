import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SHARE_PASSWORD_LENGTH,
  PASSWORD_LOCKOUT_MS,
  hasPasswordProtection,
  isShareLinkPasswordLocked,
  normalizeProvidedPassword,
  planSharePasswordFailure,
  planSharePasswordSuccess,
  resolveShareLinkStatus,
} from "./shareLinkAuth";

test("resolveShareLinkStatus covers missing, expired, processing, failed, password, and ready states", () => {
  const readyVideo = { status: "ready" as const };

  assert.equal(
    resolveShareLinkStatus({
      link: null,
      video: readyVideo,
      now: 1_000,
    }),
    "missing",
  );

  assert.equal(
    resolveShareLinkStatus({
      link: { expiresAt: 999 },
      video: readyVideo,
      now: 1_000,
    }),
    "expired",
  );

  assert.equal(
    resolveShareLinkStatus({
      link: {},
      video: { status: "processing" },
      now: 1_000,
    }),
    "processing",
  );

  assert.equal(
    resolveShareLinkStatus({
      link: {},
      video: { status: "failed" },
      now: 1_000,
    }),
    "failed",
  );

  assert.equal(
    resolveShareLinkStatus({
      link: { passwordHash: "hash" },
      video: readyVideo,
      now: 1_000,
    }),
    "requiresPassword",
  );

  assert.equal(
    resolveShareLinkStatus({
      link: {},
      video: readyVideo,
      now: 1_000,
    }),
    "ok",
  );
});

test("password helpers normalize inputs and detect protection/lockout", () => {
  assert.equal(normalizeProvidedPassword(undefined), undefined);
  assert.equal(normalizeProvidedPassword(null), undefined);
  assert.equal(normalizeProvidedPassword(""), undefined);
  assert.equal(normalizeProvidedPassword("secret"), "secret");
  assert.throws(
    () => normalizeProvidedPassword("x".repeat(MAX_SHARE_PASSWORD_LENGTH + 1)),
    /Password is too long/,
  );

  assert.equal(hasPasswordProtection({ password: "legacy" }), true);
  assert.equal(hasPasswordProtection({ passwordHash: "hash" }), true);
  assert.equal(hasPasswordProtection({}), false);

  assert.equal(isShareLinkPasswordLocked({ lockedUntil: 2_000 }, 1_000), true);
  assert.equal(isShareLinkPasswordLocked({ lockedUntil: 1_000 }, 1_000), false);
});

test("planSharePasswordFailure increments attempts and then applies the lockout window", () => {
  assert.deepEqual(planSharePasswordFailure({ failedAccessAttempts: 0 }, 5_000), {
    failedAccessAttempts: 1,
  });

  assert.deepEqual(planSharePasswordFailure({ failedAccessAttempts: 4 }, 5_000), {
    failedAccessAttempts: 0,
    lockedUntil: 5_000 + PASSWORD_LOCKOUT_MS,
  });
});

test("planSharePasswordSuccess clears counters and requests legacy password migration only when needed", () => {
  assert.deepEqual(
    planSharePasswordSuccess({
      failedAccessAttempts: 2,
      lockedUntil: 9_000,
      password: "legacy-secret",
    }),
    {
      shouldUpgradeLegacyPassword: true,
      updates: {
        failedAccessAttempts: 0,
        lockedUntil: undefined,
      },
    },
  );

  assert.deepEqual(
    planSharePasswordSuccess({
      failedAccessAttempts: 0,
      passwordHash: "hash",
    }),
    {
      shouldUpgradeLegacyPassword: false,
      updates: {},
    },
  );
});
