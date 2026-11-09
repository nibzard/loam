import test from "node:test";
import assert from "node:assert/strict";
import type { PaginationResult } from "convex/server";
import {
  LIST_ITEM_CAP,
  capRawPage,
  capScannedCount,
  collectAcceptedUpToCap,
} from "./listCaps";

test("capRawPage keeps short pages intact", () => {
  assert.deepEqual(capRawPage([]), { items: [], hasMore: false, droppedCount: 0 });
  assert.deepEqual(capRawPage([1, 2, 3], 3), {
    items: [1, 2, 3],
    hasMore: false,
    droppedCount: 0,
  });
});

test("capRawPage reports truncation for cap + 1 reads", () => {
  assert.deepEqual(capRawPage([1, 2, 3, 4], 3), {
    items: [1, 2, 3],
    hasMore: true,
    droppedCount: 1,
  });
  // Only the overflow rows actually read are counted; more may exist beyond.
  const full = Array.from({ length: LIST_ITEM_CAP + 1 }, (_, i) => i);
  assert.equal(capRawPage(full).items.length, LIST_ITEM_CAP);
  assert.equal(capRawPage(full).droppedCount, 1);
  assert.equal(capRawPage(full).hasMore, true);
});

test("capScannedCount caps at the limit and flags it", () => {
  assert.deepEqual(capScannedCount(0), { count: 0, isCapped: false });
  assert.deepEqual(capScannedCount(LIST_ITEM_CAP), {
    count: LIST_ITEM_CAP,
    isCapped: false,
  });
  assert.deepEqual(capScannedCount(LIST_ITEM_CAP + 1), {
    count: LIST_ITEM_CAP,
    isCapped: true,
  });
  assert.deepEqual(capScannedCount(5000, 10), { count: 10, isCapped: true });
});

/** Fake paginated source: serves `rows` in pages of `pageSize`. */
function fakeSource<T>(rows: T[], pageSize: number) {
  let calls = 0;
  return {
    calls: () => calls,
    paginate: async (): Promise<PaginationResult<T>> => {
      calls += 1;
      const page = rows.slice((calls - 1) * pageSize, calls * pageSize);
      return {
        page,
        isDone: calls * pageSize >= rows.length,
        continueCursor: `cursor-${calls}`,
      };
    },
  };
}

test("collectAcceptedUpToCap returns everything when under the cap", async () => {
  const source = fakeSource(["a", "b", "c"], 2);
  const result = await collectAcceptedUpToCap(source, {
    accepts: (item) => item !== "b",
  });
  assert.deepEqual(result.accepted, ["a", "c"]);
  assert.equal(result.moreRemain, false);
  assert.equal(result.skippedCount, 1);
  assert.equal(source.calls(), 2);
});

test("collectAcceptedUpToCap stops at cap + 1 accepted items", async () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);
  const source = fakeSource(rows, 100);
  const result = await collectAcceptedUpToCap(source, {
    accepts: () => true,
  });
  // cap + 1 accepted items prove truncation; the excess row is dropped by
  // capRawPage downstream.
  assert.equal(result.accepted.length, LIST_ITEM_CAP + 1);
  assert.deepEqual(result.accepted.slice(0, 3), [0, 1, 2]);
  assert.equal(result.moreRemain, true);
});

test("collectAcceptedUpToCap caps after filtering, skipping rejected rows", async () => {
  // Restricted rows (even-indexed) must not consume the cap.
  const rows = Array.from({ length: 40 }, (_, i) => i);
  const result = await collectAcceptedUpToCap(fakeSource(rows, 7), {
    cap: 10,
    accepts: (item) => item % 2 === 0,
  });
  assert.deepEqual(result.accepted, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert.equal(result.skippedCount, 10);
  assert.equal(result.moreRemain, true);
});

test("collectAcceptedUpToCap handles an empty index", async () => {
  const result = await collectAcceptedUpToCap(fakeSource([], 100), {
    accepts: () => true,
  });
  assert.deepEqual(result.accepted, []);
  assert.equal(result.moreRemain, false);
  assert.equal(result.skippedCount, 0);
});

test("collectAcceptedUpToCap handles a fully rejected index", async () => {
  const result = await collectAcceptedUpToCap(fakeSource([1, 2, 3], 2), {
    accepts: () => false,
  });
  assert.deepEqual(result.accepted, []);
  assert.equal(result.moreRemain, false);
  assert.equal(result.skippedCount, 3);
});
