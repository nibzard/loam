import test from "node:test";
import assert from "node:assert/strict";
import {
  planUsageCompaction,
  planWatchUsageUpdate,
  resolveCanonicalWatchUsageState,
} from "./watchEvents";

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

test("resolveCanonicalWatchUsageState keeps an already-canonical current month", () => {
  const result = resolveCanonicalWatchUsageState({
    team: {
      currentWatchUsageMonthKey: "2026-03",
      currentMemberWatchSeconds: 240,
      currentSharedWatchSeconds: 90,
      currentWatchUsageUpdatedAt: 1234,
    },
    currentMonthKey: "2026-03",
    legacyCurrentMonthUsage: {
      memberWatchSeconds: 10,
      sharedWatchSeconds: 5,
    },
    now: 5000,
  });

  assert.deepEqual(result.currentUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 240,
    sharedWatchSeconds: 90,
    updatedAt: 1234,
  });
  assert.equal(result.previousUsageToArchive, null);
  assert.equal(result.shouldBootstrapFromLegacyCurrentMonth, false);
});

test("resolveCanonicalWatchUsageState rolls the previous canonical month into archive and seeds from legacy rows", () => {
  const result = resolveCanonicalWatchUsageState({
    team: {
      currentWatchUsageMonthKey: "2026-02",
      currentMemberWatchSeconds: 480,
      currentSharedWatchSeconds: 120,
      currentWatchUsageUpdatedAt: 2222,
    },
    currentMonthKey: "2026-03",
    legacyCurrentMonthUsage: {
      memberWatchSeconds: 30,
      sharedWatchSeconds: 15,
    },
    now: 9999,
  });

  assert.deepEqual(result.currentUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 30,
    sharedWatchSeconds: 15,
    updatedAt: 9999,
  });
  assert.deepEqual(result.previousUsageToArchive, {
    monthKey: "2026-02",
    memberWatchSeconds: 480,
    sharedWatchSeconds: 120,
    updatedAt: 2222,
  });
  assert.equal(result.shouldBootstrapFromLegacyCurrentMonth, true);
});

test("planWatchUsageUpdate consumes exactly to the cap boundary", () => {
  const result = planWatchUsageUpdate({
    usage: {
      monthKey: "2026-03",
      memberWatchSeconds: 240,
      sharedWatchSeconds: 90,
      updatedAt: 100,
    },
    usageKind: "member",
    requestedWatchSeconds: 60,
    limitSeconds: 300,
    updatedAt: 200,
  });

  assert.equal(result.remainingSeconds, 60);
  assert.equal(result.consumedWatchSeconds, 60);
  assert.equal(result.capReached, false);
  assert.deepEqual(result.nextUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 300,
    sharedWatchSeconds: 90,
    updatedAt: 200,
  });
});

test("planWatchUsageUpdate rejects overspend once no budget remains", () => {
  const result = planWatchUsageUpdate({
    usage: {
      monthKey: "2026-03",
      memberWatchSeconds: 120,
      sharedWatchSeconds: 300,
      updatedAt: 100,
    },
    usageKind: "shared",
    requestedWatchSeconds: 15,
    limitSeconds: 300,
    updatedAt: 200,
  });

  assert.equal(result.remainingSeconds, 0);
  assert.equal(result.consumedWatchSeconds, 0);
  assert.equal(result.capReached, true);
  assert.deepEqual(result.nextUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 120,
    sharedWatchSeconds: 300,
    updatedAt: 200,
  });
});

test("planWatchUsageUpdate keeps member and shared buckets isolated across repeated updates", () => {
  const memberUpdate = planWatchUsageUpdate({
    usage: {
      monthKey: "2026-03",
      memberWatchSeconds: 60,
      sharedWatchSeconds: 90,
      updatedAt: 100,
    },
    usageKind: "member",
    requestedWatchSeconds: 30,
    limitSeconds: 120,
    updatedAt: 200,
  });

  const sharedUpdate = planWatchUsageUpdate({
    usage: memberUpdate.nextUsage,
    usageKind: "shared",
    requestedWatchSeconds: 50,
    limitSeconds: 120,
    updatedAt: 300,
  });

  assert.deepEqual(memberUpdate.nextUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 90,
    sharedWatchSeconds: 90,
    updatedAt: 200,
  });
  assert.equal(sharedUpdate.consumedWatchSeconds, 30);
  assert.equal(sharedUpdate.capReached, true);
  assert.deepEqual(sharedUpdate.nextUsage, {
    monthKey: "2026-03",
    memberWatchSeconds: 90,
    sharedWatchSeconds: 120,
    updatedAt: 300,
  });
});
