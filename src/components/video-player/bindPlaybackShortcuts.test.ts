import assert from "node:assert/strict";
import test from "node:test";

import {
  HALF_SPEED_DELAY_MS,
  PUBLIC_SEEK_SECONDS,
  applyPlaybackAction,
  createChordTracker,
  nextShuttleRate,
  playbackShortcut,
  type PlaybackShortcutHandle,
} from "./bindPlaybackShortcuts";

const event = {
  key: "k",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
};

test("editor keys map to the Final Cut actions; public players keep plain controls", () => {
  assert.equal(playbackShortcut({ ...event, key: " " }, null, true), "toggle");
  assert.equal(playbackShortcut(event, null, true), "pause");
  assert.equal(playbackShortcut({ ...event, key: "f" }, null, true), "fullscreen");
  assert.equal(playbackShortcut({ ...event, key: "m" }, null, true), "mute");
  assert.equal(playbackShortcut({ ...event, key: "j" }, null, true), "reverse");
  assert.equal(playbackShortcut({ ...event, key: "l" }, null, true), "forward");
  assert.equal(playbackShortcut({ ...event, key: "," }, null, true), "stepBack");
  assert.equal(playbackShortcut({ ...event, key: "." }, null, true), "stepForward");
  assert.equal(playbackShortcut({ ...event, key: "ArrowLeft" }, null, true), "stepBack");
  assert.equal(playbackShortcut({ ...event, key: "ArrowRight" }, null, true), "stepForward");
  assert.equal(
    playbackShortcut({ ...event, key: "ArrowLeft", shiftKey: true }, null, true),
    "stepBackTen",
  );
  assert.equal(
    playbackShortcut({ ...event, key: "ArrowRight", shiftKey: true }, null, true),
    "stepForwardTen",
  );
  assert.equal(
    playbackShortcut({ ...event, key: " ", shiftKey: true }, null, true),
    "reverseNormal",
  );
  assert.equal(playbackShortcut({ ...event, key: " " }, null, false), "toggle");
  assert.equal(playbackShortcut({ ...event, key: "ArrowLeft" }, null, false), "seekBack");
  assert.equal(playbackShortcut({ ...event, key: "ArrowRight" }, null, false), "seekForward");
  assert.equal(playbackShortcut({ ...event, key: "j" }, null, false), null);
  assert.equal(playbackShortcut({ ...event, key: "," }, null, false), null);
  assert.equal(
    playbackShortcut({ ...event, key: "ArrowLeft", shiftKey: true }, null, false),
    null,
  );
  assert.equal(playbackShortcut({ ...event, key: " ", shiftKey: true }, null, false), null);
});

test("Alt plus J and L reads event.code so non-US layouts work; other modifiers stay inert", () => {
  assert.equal(
    playbackShortcut({ ...event, key: "¬", code: "KeyL", altKey: true }, null, true),
    "slowForward",
  );
  assert.equal(
    playbackShortcut({ ...event, key: "∆", code: "KeyJ", altKey: true }, null, true),
    "slowReverse",
  );
  assert.equal(
    playbackShortcut({ ...event, key: "l", altKey: true }, null, true),
    "slowForward",
  );
  assert.equal(
    playbackShortcut({ ...event, key: "l", altKey: true, repeat: true }, null, true),
    "handled",
  );
  assert.equal(
    playbackShortcut({ ...event, key: "l", altKey: true, shiftKey: true }, null, true),
    null,
  );
  assert.equal(
    playbackShortcut({ ...event, key: "l", altKey: true, metaKey: true }, null, true),
    null,
  );
  assert.equal(playbackShortcut({ ...event, key: "l", altKey: true }, null, false), null);
});

test("modifiers, composition, editable targets and held toggle keys are ignored", () => {
  for (const flag of ["ctrlKey", "metaKey", "shiftKey", "isComposing", "defaultPrevented"])
    assert.equal(playbackShortcut({ ...event, key: "l", [flag]: true }, null, true), null);
  for (const key of [" ", "k", "f", "m", "j", "l"])
    assert.equal(playbackShortcut({ ...event, key, repeat: true }, null, true), "handled");
  assert.equal(playbackShortcut(event, { closest: () => ({}) }, true), null);
  assert.equal(
    playbackShortcut({ ...event, key: "ArrowLeft", repeat: true }, null, true),
    "stepBack",
  );
});

test("keyboard-focused buttons keep native Space and arrows; pointer focus claims them", () => {
  const button = { closest: (selector: string) => (selector.startsWith("button") ? {} : null) };
  assert.equal(playbackShortcut({ ...event, key: " " }, button, true), null);
  assert.equal(playbackShortcut({ ...event, key: "ArrowLeft" }, button, true), null);
  assert.equal(playbackShortcut({ ...event, key: " " }, button, true, true), "toggle");
  assert.equal(playbackShortcut({ ...event, key: "ArrowLeft" }, button, true, true), "stepBack");
  assert.equal(playbackShortcut({ ...event, key: "." }, button, true), "stepForward");
});

test("the shuttle ladder climbs in a direction and restarts on pause or reversal", () => {
  let rate = 1;
  for (const speed of [2, 4, 8, 16, 32, 32]) {
    rate = nextShuttleRate(rate, 1, true);
    assert.equal(rate, speed);
  }
  assert.equal(nextShuttleRate(1, -1, true), -1);
  let reverse = -1;
  for (const speed of [-2, -4, -8, -16, -32, -32]) {
    reverse = nextShuttleRate(reverse, -1, true);
    assert.equal(reverse, speed);
  }
  assert.equal(nextShuttleRate(32, -1, true), -1);
  assert.equal(nextShuttleRate(-8, 1, true), 1);
  assert.equal(nextShuttleRate(8, 1, false), 1);
  assert.equal(nextShuttleRate(1.25, 1, true), 2);
  assert.equal(nextShuttleRate(-2, -1, false), -1);
});

function recorderHandle(overrides: Partial<PlaybackShortcutHandle> = {}) {
  const calls: string[] = [];
  const handle: PlaybackShortcutHandle = {
    playing: false,
    rate: 1,
    pause: () => calls.push("pause"),
    toggle: () => calls.push("toggle"),
    playAt: (rate) => calls.push(`playAt:${rate}`),
    step: (frames) => calls.push(`step:${frames}`),
    seekBy: (seconds) => calls.push(`seekBy:${seconds}`),
    toggleFullscreen: () => calls.push("fullscreen"),
    toggleMute: () => calls.push("mute"),
    ...overrides,
  };
  return { handle, calls };
}

test("every action drives the handle; shuttling consults the current rate", () => {
  const { handle, calls } = recorderHandle();
  const cases: [Parameters<typeof applyPlaybackAction>[1], string][] = [
    ["toggle", "toggle"],
    ["pause", "pause"],
    ["reverseNormal", "playAt:-1"],
    ["slowReverse", "playAt:-0.5"],
    ["slowForward", "playAt:0.5"],
    ["stepBackTen", "step:-10"],
    ["stepForwardTen", "step:10"],
    ["stepBack", "step:-1"],
    ["stepForward", "step:1"],
    ["seekBack", `seekBy:-${PUBLIC_SEEK_SECONDS}`],
    ["seekForward", `seekBy:${PUBLIC_SEEK_SECONDS}`],
    ["fullscreen", "fullscreen"],
    ["mute", "mute"],
    ["handled", ""],
  ];
  for (const [action] of cases) applyPlaybackAction(handle, action);
  assert.deepEqual(calls, cases.map(([, expected]) => expected).filter((expected) => expected));

  const shuttling = recorderHandle({ playing: true, rate: 4 });
  applyPlaybackAction(shuttling.handle, "forward");
  applyPlaybackAction(shuttling.handle, "reverse");
  assert.deepEqual(shuttling.calls, ["playAt:8", "playAt:-1"]);

  const reversing = recorderHandle({ playing: true, rate: -2 });
  applyPlaybackAction(reversing.handle, "reverse");
  assert.deepEqual(reversing.calls, ["playAt:-4"]);

  const minimal: PlaybackShortcutHandle = {
    playing: false,
    rate: 1,
    pause: () => {},
    toggle: () => {},
    playAt: () => {},
    step: () => {},
  };
  applyPlaybackAction(minimal, "seekBack");
  applyPlaybackAction(minimal, "fullscreen");
  applyPlaybackAction(minimal, "mute");
});

function chordFixture() {
  const actions: string[] = [];
  let pending: { callback: () => void; ms: number } | undefined;
  const tracker = createChordTracker((action) => actions.push(action), {
    schedule: (callback, ms) => {
      pending = { callback, ms };
      return 1;
    },
    cancel: () => {
      pending = undefined;
    },
  });
  return {
    tracker,
    actions,
    pending: () => pending,
    fire() {
      const next = pending;
      pending = undefined;
      next?.callback();
    },
  };
}

const kDown = { key: "k", altKey: false, shiftKey: false };
const jDown = { key: "j", altKey: false, shiftKey: false };

test("holding K and tapping J or L steps one frame each tap, then pauses", () => {
  const f = chordFixture();
  assert.equal(f.tracker.keyDown(kDown), false);
  assert.deepEqual(f.actions, []);
  assert.equal(f.tracker.keyDown(jDown), true);
  assert.deepEqual(f.actions, ["stepBack"]);
  f.tracker.keyUp("j");
  assert.deepEqual(f.actions, ["stepBack", "pause"]);
  assert.equal(f.pending(), undefined);
  assert.equal(f.tracker.keyDown(jDown), true);
  f.tracker.keyUp("j");
  f.tracker.keyUp("k");
  assert.deepEqual(f.actions, ["stepBack", "pause", "stepBack", "pause"]);
});

test("holding K with J or L past the delay runs half speed until either key is released", () => {
  const f = chordFixture();
  f.tracker.keyDown(kDown);
  f.tracker.keyDown(jDown);
  assert.equal(f.pending()?.ms, HALF_SPEED_DELAY_MS);
  f.fire();
  assert.deepEqual(f.actions, ["stepBack", "slowReverse"]);
  f.tracker.keyUp("k");
  assert.deepEqual(f.actions, ["stepBack", "slowReverse", "pause"]);
  f.tracker.keyUp("j");
  assert.deepEqual(f.actions, ["stepBack", "slowReverse", "pause"]);

  const forward = chordFixture();
  forward.tracker.keyDown(kDown);
  forward.tracker.keyDown({ key: "l", altKey: false, shiftKey: false });
  forward.fire();
  forward.tracker.keyUp("l");
  assert.deepEqual(forward.actions, ["stepForward", "slowForward", "pause"]);
});

test("modifier keydowns and reset clear the chord and cancel the half-speed timer", () => {
  const f = chordFixture();
  f.tracker.keyDown(kDown);
  assert.equal(f.tracker.keyDown({ key: "l", altKey: true, shiftKey: false }), false);
  assert.deepEqual(f.actions, []);
  assert.equal(f.pending(), undefined);
  assert.equal(f.tracker.keyDown(jDown), false);
  assert.deepEqual(f.actions, []);

  const held = chordFixture();
  held.tracker.keyDown(kDown);
  held.tracker.keyDown(jDown);
  held.tracker.reset();
  held.fire();
  assert.deepEqual(held.actions, ["stepBack", "pause"]);
  assert.equal(held.pending(), undefined);
});
