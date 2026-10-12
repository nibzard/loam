import assert from "node:assert/strict";
import test from "node:test";

import {
  isVisibleToShareDiscussion,
  resolveDiscussionAudience,
} from "./discussionAudience";

test("legacy discussion rows default to team audience", () => {
  assert.equal(resolveDiscussionAudience({}), "team");
});

test("share audience is the only audience visible on share links", () => {
  assert.equal(isVisibleToShareDiscussion({ audience: "share" }), true);
  assert.equal(isVisibleToShareDiscussion({ audience: "team" }), false);
  assert.equal(isVisibleToShareDiscussion({}), false);
});

