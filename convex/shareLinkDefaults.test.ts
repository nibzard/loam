import test from "node:test";
import assert from "node:assert/strict";

import {
  isReusableDefaultShareLink,
  pickReusableDefaultShareLink,
} from "./shareLinkDefaults";

test("default share link policy reuses the newest unrestricted non-expiring link", () => {
  const now = Date.now();

  const result = pickReusableDefaultShareLink(
    [
      {
        _creationTime: now - 5_000,
        allowDownload: false,
        token: "older",
      },
      {
        _creationTime: now - 1_000,
        allowDownload: false,
        token: "newer",
      },
    ],
    now,
  );

  assert.equal(result?.token, "newer");
});

test("default share link policy skips expiring, protected, and downloadable links", () => {
  const now = Date.now();

  assert.equal(
    isReusableDefaultShareLink(
      {
        _creationTime: now - 1_000,
        allowDownload: true,
        token: "downloadable",
      },
      now,
    ),
    false,
  );

  assert.equal(
    isReusableDefaultShareLink(
      {
        _creationTime: now - 1_000,
        allowDownload: false,
        expiresAt: now + 60_000,
        token: "expiring",
      },
      now,
    ),
    false,
  );

  assert.equal(
    isReusableDefaultShareLink(
      {
        _creationTime: now - 1_000,
        allowDownload: false,
        passwordHash: "hash",
        token: "protected",
      },
      now,
    ),
    false,
  );
});
