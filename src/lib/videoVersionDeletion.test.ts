import assert from "node:assert/strict";
import test from "node:test";
import type { Id } from "@convex/_generated/dataModel";

import { findPreferredReplacementVideoId } from "./videoVersionDeletion";

function videoId(id: string) {
  return id as Id<"videos">;
}

test("prefers the newer survivor when the deleted version has one", () => {
  const versions = [
    { _id: videoId("v3") },
    { _id: videoId("v2") },
    { _id: videoId("v1") },
  ];

  assert.equal(
    findPreferredReplacementVideoId(versions, videoId("v2")),
    videoId("v3"),
  );
});

test("falls back to the older survivor when deleting the latest version", () => {
  const versions = [
    { _id: videoId("v3") },
    { _id: videoId("v2") },
    { _id: videoId("v1") },
  ];

  assert.equal(
    findPreferredReplacementVideoId(versions, videoId("v3")),
    videoId("v2"),
  );
});

test("returns null when the deleted version is the whole stack", () => {
  assert.equal(
    findPreferredReplacementVideoId([{ _id: videoId("v1") }], videoId("v1")),
    null,
  );
});

test("returns null when the version list is missing or lacks the version", () => {
  assert.equal(findPreferredReplacementVideoId(undefined, videoId("v1")), null);
  assert.equal(
    findPreferredReplacementVideoId([{ _id: videoId("v1") }], videoId("v9")),
    null,
  );
});
