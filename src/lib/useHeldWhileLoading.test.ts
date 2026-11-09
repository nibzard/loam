import assert from "node:assert/strict";
import test from "node:test";

import {
  holdResult,
  nextHoldState,
  type HoldState,
} from "./useHeldWhileLoading";

/** One render of useHeldWhileLoading: transition on the value, then report. */
function render<T>(state: HoldState<T>, value: T | undefined) {
  const nextState = nextHoldState(state, value);
  return { state: nextState, view: holdResult(nextState, value) };
}

test("holds the previous team while the new one loads, then reports isHeld", () => {
  let state: HoldState<string> = { held: undefined, expired: false };

  // Nothing loaded yet: nothing to hold.
  let step = render(state, undefined);
  state = step.state;
  assert.deepEqual(step.view, { value: undefined, isHeld: false });

  // First team loads.
  step = render(state, "team-a");
  state = step.state;
  assert.deepEqual(step.view, { value: "team-a", isHeld: false });

  // Switch: the new team loads, the old one is held for rendering only.
  step = render(state, undefined);
  state = step.state;
  assert.deepEqual(step.view, { value: "team-a", isHeld: true });

  // The hold expires: the stale value must stop being reported.
  state = { ...state, expired: true };
  step = render(state, undefined);
  state = step.state;
  assert.deepEqual(step.view, { value: undefined, isHeld: false });

  // The next team loads and later becomes the held value itself.
  step = render(state, "team-b");
  state = step.state;
  assert.deepEqual(step.view, { value: "team-b", isHeld: false });
  step = render(state, undefined);
  assert.deepEqual(step.view, { value: "team-b", isHeld: true });
});

test("a loaded value clears an expired hold", () => {
  const expired: HoldState<string> = { held: "team-a", expired: true };

  const step = render(expired, "team-b");
  assert.deepEqual(step.state, { held: "team-b", expired: false });
  assert.deepEqual(step.view, { value: "team-b", isHeld: false });
});

test("re-delivering the same value keeps the state object, so no re-render", () => {
  const state: HoldState<string> = { held: "team-a", expired: false };
  assert.equal(nextHoldState(state, "team-a"), state);
  assert.equal(nextHoldState(state, undefined), state);
});
