import assert from "node:assert/strict";
import test from "node:test";

import { createWatchProgressMachine } from "./useWatchProgress";

test("watch progress machine stops tracking after a partial cap response", () => {
  const machine = createWatchProgressMachine();

  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 0,
  });
  const shouldFlush = machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 6,
  });

  assert.equal(shouldFlush, true);

  const started = machine.startFlush({
    enabled: true,
    minReportSeconds: 1,
    target: { publicId: "public_123" },
  });

  assert.ok(started);
  assert.equal(started.requestedWatchSeconds, 6);

  const finish = machine.finishFlush(started.generation, {
    recorded: true,
    capReached: true,
    usageKind: "shared",
    consumedWatchSeconds: 2,
    requestedWatchSeconds: 6,
  });

  assert.deepEqual(finish, {
    capReached: true,
    shouldStopTracking: true,
  });
  assert.deepEqual(machine.snapshot(), {
    generation: 0,
    isCapReached: true,
    isFlushing: false,
    lastTime: 6,
    pendingWatchSeconds: 0,
  });
  assert.equal(
    machine.trackTime({
      enabled: true,
      flushThresholdSeconds: 5,
      maxDeltaSeconds: 10,
      time: 12,
    }),
    false,
  );
});

test("watch progress machine drops stale failed flushes after reset", () => {
  const machine = createWatchProgressMachine();

  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 0,
  });
  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 8,
  });

  const started = machine.startFlush({
    enabled: true,
    minReportSeconds: 1,
    target: { publicId: "public_123" },
  });

  assert.ok(started);
  machine.reset();
  machine.failFlush(started.generation, started.requestedWatchSeconds);

  assert.deepEqual(machine.snapshot(), {
    generation: 1,
    isCapReached: false,
    isFlushing: false,
    lastTime: null,
    pendingWatchSeconds: 0,
  });
});

test("watch progress machine ignores stale cap responses after reset", () => {
  const machine = createWatchProgressMachine();

  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 0,
  });
  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 8,
  });

  const started = machine.startFlush({
    enabled: true,
    minReportSeconds: 1,
    target: { grantToken: "grant_123" },
  });

  assert.ok(started);
  machine.reset();

  const finish = machine.finishFlush(started.generation, {
    recorded: true,
    capReached: true,
    usageKind: "shared",
    consumedWatchSeconds: 0,
    requestedWatchSeconds: started.requestedWatchSeconds,
  });

  assert.deepEqual(finish, {
    capReached: false,
    shouldStopTracking: false,
  });
  assert.deepEqual(machine.snapshot(), {
    generation: 1,
    isCapReached: false,
    isFlushing: false,
    lastTime: null,
    pendingWatchSeconds: 0,
  });
});

test("watch progress machine clears pending state when no playback target is available", () => {
  const machine = createWatchProgressMachine();

  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 0,
  });
  machine.trackTime({
    enabled: true,
    flushThresholdSeconds: 5,
    maxDeltaSeconds: 10,
    time: 6,
  });

  const started = machine.startFlush({
    enabled: true,
    minReportSeconds: 1,
    target: {},
  });

  assert.equal(started, null);
  assert.deepEqual(machine.snapshot(), {
    generation: 0,
    isCapReached: false,
    isFlushing: false,
    lastTime: null,
    pendingWatchSeconds: 0,
  });
});
