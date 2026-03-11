import assert from "node:assert/strict";
import test from "node:test";

import { isPlaybackAccessError } from "./playbackErrors";

test("isPlaybackAccessError detects 401 and 403 loader failures", () => {
  assert.equal(isPlaybackAccessError({ response: { code: 401 } }), true);
  assert.equal(isPlaybackAccessError({ response: { code: 403 } }), true);
  assert.equal(isPlaybackAccessError({ response: { status: 403 } }), true);
  assert.equal(isPlaybackAccessError({ networkDetails: { status: 401 } }), true);
});

test("isPlaybackAccessError ignores non-auth and missing statuses", () => {
  assert.equal(isPlaybackAccessError({ response: { code: 404 } }), false);
  assert.equal(isPlaybackAccessError({ networkDetails: { status: 500 } }), false);
  assert.equal(isPlaybackAccessError({}), false);
});
