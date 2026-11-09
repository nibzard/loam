import test from "node:test";
import assert from "node:assert/strict";

import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  BULK_DELETE_DB_CALLS_PER_SELECTED_ID,
  BULK_DELETE_DB_CALLS_PER_VERSION,
  MAX_BULK_DELETE_DB_CALLS,
  MAX_BULK_DELETE_SCHEDULED_JOBS,
  MAX_BULK_DELETE_VERSIONS,
  MAX_BULK_VIDEO_ACTION,
  assertBulkDeleteScheduledJobBudget,
  assertBulkDeleteVersionBudget,
  countBulkDeleteDbCalls,
  countBulkDeleteScheduledJobs,
  uniqueBulkVideoIds,
} from "./videos";

const videoId = (id: string) => id as Id<"videos">;

function assertCodedRejection(thrower: () => unknown, message: string) {
  assert.throws(thrower, (error: unknown) => {
    assert.ok(error instanceof ConvexError, "expected a ConvexError");
    assert.deepEqual(error.data, { code: "BAD_REQUEST", message });
    return true;
  });
}

test("uniqueBulkVideoIds dedupes ids inside the cap", () => {
  const ids = [videoId("a"), videoId("a"), videoId("b"), videoId("a")];
  assert.deepEqual(uniqueBulkVideoIds(ids), [videoId("a"), videoId("b")]);
});

test("uniqueBulkVideoIds accepts exactly the cap", () => {
  const ids = Array.from({ length: MAX_BULK_VIDEO_ACTION }, (_, index) =>
    videoId(`v${index}`),
  );
  assert.equal(uniqueBulkVideoIds(ids).length, MAX_BULK_VIDEO_ACTION);
});

test("uniqueBulkVideoIds rejects oversized batches with a coded error", () => {
  const ids = Array.from({ length: MAX_BULK_VIDEO_ACTION + 1 }, (_, index) =>
    videoId(`v${index}`),
  );
  assertCodedRejection(
    () => uniqueBulkVideoIds(ids),
    `You can act on at most ${MAX_BULK_VIDEO_ACTION} videos at once.`,
  );
});

test("the version budget rejects past its cap with its own message", () => {
  assert.doesNotThrow(() =>
    assertBulkDeleteVersionBudget(MAX_BULK_DELETE_VERSIONS),
  );
  assertCodedRejection(
    () => assertBulkDeleteVersionBudget(MAX_BULK_DELETE_VERSIONS + 1),
    "Too many versions to delete at once. Select fewer videos.",
  );
  // A tighter caller-provided cap keeps working.
  assertCodedRejection(
    () => assertBulkDeleteVersionBudget(11, 10),
    "Too many versions to delete at once. Select fewer videos.",
  );
});

test("the scheduled-job budget rejects past its cap with its own message", () => {
  assert.doesNotThrow(() =>
    assertBulkDeleteScheduledJobBudget(MAX_BULK_DELETE_SCHEDULED_JOBS),
  );
  assertCodedRejection(
    () =>
      assertBulkDeleteScheduledJobBudget(MAX_BULK_DELETE_SCHEDULED_JOBS + 1),
    "Too many scheduled jobs to delete at once. Select fewer videos.",
  );
});

test("the worst case at the caps stays under every Convex limit", () => {
  // Worst case: the full id cap selects the full version cap, every version
  // carries stored objects (a cleanup job plus a possible drain
  // continuation each), and the dependent drain pays its per-version query
  // and delete cost inside the one removeMany transaction.
  const dbCalls = countBulkDeleteDbCalls({
    selectedIds: MAX_BULK_VIDEO_ACTION,
    versions: MAX_BULK_DELETE_VERSIONS,
  });
  assert.ok(dbCalls <= MAX_BULK_DELETE_DB_CALLS);

  const scheduledJobs = countBulkDeleteScheduledJobs({
    versions: MAX_BULK_DELETE_VERSIONS,
    versionsWithAssets: MAX_BULK_DELETE_VERSIONS,
  });
  assert.ok(scheduledJobs <= MAX_BULK_DELETE_SCHEDULED_JOBS);
});

test("the db-call budget counts pass 1 and the drain separately", () => {
  assert.equal(
    countBulkDeleteDbCalls({ selectedIds: 3, versions: 0 }),
    3 * BULK_DELETE_DB_CALLS_PER_SELECTED_ID,
  );
  assert.equal(
    countBulkDeleteDbCalls({ selectedIds: 0, versions: 4 }),
    4 * BULK_DELETE_DB_CALLS_PER_VERSION,
  );
  assert.equal(
    countBulkDeleteScheduledJobs({ versions: 4, versionsWithAssets: 3 }),
    7,
  );
});
