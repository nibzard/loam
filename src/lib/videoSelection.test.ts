import assert from "node:assert/strict";
import test from "node:test";
import { ConvexError } from "convex/values";
import {
  BULK_VIDEO_ACTION_LIMIT,
  chunk,
  clickSelection,
  pruneSelection,
  runBulkVideoAction,
  selectRange,
  toggleSelection,
} from "./videoSelection";

const ids = ["a", "b", "c", "d", "e", "f"];
const sorted = (set: ReadonlySet<string>) => [...set].sort();

test("toggleSelection adds and removes an id", () => {
  const added = toggleSelection(new Set<string>(), "a");
  assert.deepEqual([...added], ["a"]);
  assert.deepEqual([...toggleSelection(added, "a")], []);
});

test("selectRange selects everything between anchor and target in either direction", () => {
  assert.deepEqual(sorted(selectRange(ids, "b", "e", new Set(["b"]))), ["b", "c", "d", "e"]);
  assert.deepEqual(sorted(selectRange(ids, "e", "b", new Set(["e"]))), ["b", "c", "d", "e"]);
});

test("selectRange keeps existing selections outside the range", () => {
  assert.deepEqual(sorted(selectRange(ids, "c", "d", new Set(["a", "c"]))), ["a", "c", "d"]);
});

test("selectRange adds only the target when the anchor is missing", () => {
  assert.deepEqual([...selectRange(ids, "z", "d", new Set<string>())], ["d"]);
  assert.deepEqual([...selectRange(ids, null, "d", new Set<string>())], ["d"]);
});

test("clickSelection toggles without shift and moves the anchor", () => {
  const next = clickSelection(ids, { selected: new Set(["a"]), anchor: "a" }, "c", false);
  assert.deepEqual(sorted(next.selected), ["a", "c"]);
  assert.equal(next.anchor, "c");
});

test("clickSelection extends a range with shift", () => {
  const next = clickSelection(ids, { selected: new Set(["a"]), anchor: "a" }, "f", true);
  assert.deepEqual(sorted(next.selected), ids);
  assert.equal(next.anchor, "f");
});

test("clickSelection toggles on shift-click without a usable anchor", () => {
  assert.deepEqual(
    [...clickSelection(ids, { selected: new Set<string>(), anchor: null }, "c", true).selected],
    ["c"],
  );
  assert.deepEqual(
    [...clickSelection(ids, { selected: new Set(["c"]), anchor: "c" }, "c", true).selected],
    [],
  );
});

test("pruneSelection drops missing ids and preserves identity when unchanged", () => {
  const selected = new Set(["a", "b"]);
  assert.equal(pruneSelection(selected, new Set(ids)), selected);
  assert.deepEqual([...pruneSelection(selected, new Set(["b"]))], ["b"]);
});

test("chunk splits into fixed-size chunks", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test("runBulkVideoAction chunks at the server cap", async () => {
  const chunkSizes: number[] = [];
  const total = BULK_VIDEO_ACTION_LIMIT * 2 + 3;
  const result = await runBulkVideoAction(
    Array.from({ length: total }, (_, index) => index),
    (chunkIds) => {
      chunkSizes.push(chunkIds.length);
      return Promise.resolve();
    },
    "fallback",
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(chunkSizes, [BULK_VIDEO_ACTION_LIMIT, BULK_VIDEO_ACTION_LIMIT, 3]);
});

test("runBulkVideoAction awaits each chunk before starting the next", async () => {
  // Parallel chunks (Promise.all, the pre-da236dc bug) would log both starts
  // before either end.
  const events: string[] = [];
  await runBulkVideoAction(
    Array.from({ length: BULK_VIDEO_ACTION_LIMIT + 1 }, (_, index) => index),
    (chunkIds) => {
      events.push(`start:${chunkIds.length}`);
      return Promise.resolve().then(() => {
        events.push(`end:${chunkIds.length}`);
      });
    },
    "fallback",
  );
  assert.deepEqual(events, [
    `start:${BULK_VIDEO_ACTION_LIMIT}`,
    `end:${BULK_VIDEO_ACTION_LIMIT}`,
    "start:1",
    "end:1",
  ]);
});

test("runBulkVideoAction stops at the first failed chunk and reports progress", async () => {
  const attempted: number[] = [];
  const total = BULK_VIDEO_ACTION_LIMIT + 2;
  const result = await runBulkVideoAction(
    Array.from({ length: total }, (_, index) => index),
    (chunkIds) => {
      attempted.push(chunkIds.length);
      if (chunkIds.length === 2) return Promise.reject(new Error("boom"));
      return Promise.resolve();
    },
    "fallback",
  );
  assert.deepEqual(result, {
    ok: false,
    error: `boom (${BULK_VIDEO_ACTION_LIMIT} of ${total} already done)`,
  });
  // The failed chunk is the last one attempted; nothing after it runs.
  assert.deepEqual(attempted, [BULK_VIDEO_ACTION_LIMIT, 2]);
});

test("runBulkVideoAction reports the bare message when the first chunk fails", async () => {
  const result = await runBulkVideoAction(
    ["a"],
    () => Promise.reject(new Error("early")),
    "fallback",
  );
  assert.deepEqual(result, { ok: false, error: "early" });
});

test("runBulkVideoAction catches sync throws and non-Error rejections", async () => {
  const thrown = await runBulkVideoAction(
    ["a"],
    () => {
      throw new Error("sync");
    },
    "fallback",
  );
  assert.deepEqual(thrown, { ok: false, error: "sync" });

  const nonError = await runBulkVideoAction(["a"], () => Promise.reject("nope"), "fallback");
  assert.deepEqual(nonError, { ok: false, error: "fallback" });
});

test("runBulkVideoAction decodes coded ConvexErrors instead of stringified JSON", async () => {
  const result = await runBulkVideoAction(
    ["a"],
    () =>
      Promise.reject(
        new ConvexError({
          code: "BAD_REQUEST",
          message: "You can act on at most 100 videos at once.",
        }),
      ),
    "Failed to update status",
  );
  assert.deepEqual(result, {
    ok: false,
    error: "You can act on at most 100 videos at once.",
  });
});

test("runBulkVideoAction falls back per code when the coded data carries no message", async () => {
  const result = await runBulkVideoAction(
    ["a"],
    () => Promise.reject(new ConvexError({ code: "UNAUTHENTICATED" })),
    "Failed to update status",
  );
  assert.deepEqual(result, {
    ok: false,
    error: "Your session expired. Sign in again to retry.",
  });
});
