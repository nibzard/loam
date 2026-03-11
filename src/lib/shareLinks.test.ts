import test from "node:test";
import assert from "node:assert/strict";

import { buildRestrictedShareUrl, prepareDefaultShareLink } from "./shareLinks";

test("prepareDefaultShareLink builds and copies a restricted share URL", async () => {
  const calls: Array<{ videoId: string }> = [];
  const copied: string[] = [];

  const result = await prepareDefaultShareLink({
    videoId: "video_123" as never,
    origin: "https://loam.test",
    ensureDefaultShareLink: async ({ videoId }) => {
      calls.push({ videoId });
      return {
        reused: true,
        token: "share_123",
      };
    },
    copyText: async (url) => {
      copied.push(url);
      return true;
    },
  });

  assert.deepEqual(calls, [{ videoId: "video_123" }]);
  assert.deepEqual(copied, ["https://loam.test/share/share_123"]);
  assert.deepEqual(result, {
    copied: true,
    url: "https://loam.test/share/share_123",
  });
});

test("prepareDefaultShareLink still returns the restricted URL when copy fails", async () => {
  const result = await prepareDefaultShareLink({
    videoId: "video_123" as never,
    origin: "https://loam.test",
    ensureDefaultShareLink: async () => ({
      reused: false,
      token: "share_456",
    }),
    copyText: async () => false,
  });

  assert.deepEqual(result, {
    copied: false,
    url: buildRestrictedShareUrl("share_456", "https://loam.test"),
  });
});
