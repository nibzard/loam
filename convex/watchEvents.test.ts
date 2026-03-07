import test from "node:test";
import assert from "node:assert/strict";
import { planUsageCompaction } from "./watchEvents";

test("planUsageCompaction returns null for no rows", () => {
  const result = planUsageCompaction([]);
  assert.equal(result, null);
});

test("planUsageCompaction keeps single row unchanged", () => {
  const rows = [
    {
      _id: "usage_1",
      memberWatchSeconds: 120,
      sharedWatchSeconds: 45,
    },
  ];

  const result = planUsageCompaction(rows);
  assert.ok(result);
  assert.equal(result.primary._id, "usage_1");
  assert.equal(result.memberWatchSeconds, 120);
  assert.equal(result.sharedWatchSeconds, 45);
  assert.deepEqual(result.duplicateIds, []);
  assert.equal(result.hasDuplicates, false);
});

test("planUsageCompaction consolidates duplicate monthly rows", () => {
  const rows = [
    {
      _id: "usage_primary",
      memberWatchSeconds: 100,
      sharedWatchSeconds: 30,
    },
    {
      _id: "usage_dup_a",
      memberWatchSeconds: 50,
      sharedWatchSeconds: 10,
    },
    {
      _id: "usage_dup_b",
      memberWatchSeconds: 20,
      sharedWatchSeconds: 5,
    },
  ];

  const result = planUsageCompaction(rows);
  assert.ok(result);
  assert.equal(result.primary._id, "usage_primary");
  assert.equal(result.memberWatchSeconds, 170);
  assert.equal(result.sharedWatchSeconds, 45);
  assert.deepEqual(result.duplicateIds, ["usage_dup_a", "usage_dup_b"]);
  assert.equal(result.hasDuplicates, true);
});

