import { useEffect, useState } from "react";

export type HeldWhileLoading<T> = {
  value: T | undefined;
  isHeld: boolean;
};

export type HoldState<T> = {
  held: T | undefined;
  expired: boolean;
};

/**
 * Pure transition behind `useHeldWhileLoading`, exported for tests.
 *
 * A loaded value replaces the stored one and clears any expiry. A loading
 * value (`undefined`) leaves the stored one untouched so it can be held.
 * Returns the same object when nothing changes, so the hook can skip
 * re-rendering.
 */
export function nextHoldState<T>(
  state: HoldState<T>,
  value: T | undefined,
): HoldState<T> {
  if (value === undefined) return state;
  if (value === state.held && !state.expired) return state;
  return { held: value, expired: false };
}

/**
 * What `useHeldWhileLoading` reports for the latest value: the fresh value
 * when loaded, the held stale value while loading (until it expires), and
 * `undefined` once the hold is gone.
 */
export function holdResult<T>(
  state: HoldState<T>,
  value: T | undefined,
): HeldWhileLoading<T> {
  if (value !== undefined) return { value, isHeld: false };
  if (state.expired || state.held === undefined) {
    return { value: undefined, isHeld: false };
  }
  return { value: state.held, isHeld: true };
}

/**
 * While `value` is loading (undefined), keep returning the last loaded value
 * for up to `holdMs` so fast switches don't flash a loading state. `isHeld` is
 * true while that stale value is shown; use it only for rendering, never for
 * side effects.
 */
export function useHeldWhileLoading<T>(
  value: T | undefined,
  holdMs = 250,
): HeldWhileLoading<T> {
  const [state, setState] = useState<HoldState<T>>(() => ({
    held: value,
    expired: false,
  }));

  // Render-phase update: track the latest loaded value without waiting for
  // an effect, the same setState-during-render pattern as upstream.
  const nextState = nextHoldState(state, value);
  if (nextState !== state) setState(nextState);

  const isLoading = value === undefined;

  useEffect(() => {
    if (!isLoading) return;
    const timeout = window.setTimeout(
      () => setState((current) => ({ ...current, expired: true })),
      holdMs,
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading, holdMs]);

  return holdResult(nextState, value);
}
