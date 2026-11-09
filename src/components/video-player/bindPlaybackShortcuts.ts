import { playbackShortcut, type PlaybackAction } from "./shuttle";

export { playbackShortcut, type PlaybackAction } from "./shuttle";

/** Speeds the J and L ladder climbs through; rates above 16x run on timed seeks. */
export const SHUTTLE_SPEEDS = [1, 2, 4, 8, 16, 32] as const;

/** Holding K plus J or L this long switches from frame stepping to half speed. */
export const HALF_SPEED_DELAY_MS = 200;

/** Arrow-key skip outside the editor, in seconds. */
export const PUBLIC_SEEK_SECONDS = 5;

/** The editor layout marks its subtree so document-level keys stay inside it. */
export const VIDEO_EDITOR_SCOPE = "[data-video-editor]";

/** Mirrors the interactive selector in ./shuttle; focus into these clears chords. */
const INTERACTIVE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menu"], [role="listbox"], [role="dialog"]';

/**
 * Next signed rate for a shuttle key press. Playback in the same direction
 * climbs the ladder; a paused player or a direction change restarts at 1x.
 */
export function nextShuttleRate(rate: number, direction: -1 | 1, playing: boolean): number {
  const sameDirection = playing && Math.sign(rate) === direction;
  const nextSpeed = sameDirection
    ? (SHUTTLE_SPEEDS.find((speed) => speed > Math.abs(rate)) ?? 32)
    : 1;
  return direction * nextSpeed;
}

/**
 * Anything that can drive playback for the shortcuts. The controller returned
 * by createShuttleController satisfies this; players add the optional members.
 * The rate and playing fields are read at keypress time, so getters work.
 */
export interface PlaybackShortcutHandle {
  /** True while playing, including seek-driven rates. */
  readonly playing: boolean;
  /** Current signed rate, negative in reverse. */
  readonly rate: number;
  pause(): void;
  /** Set a signed rate and start playback; the handle clamps native rates. */
  playAt(rate: number): void;
  toggle(): void;
  /** Step by frames at 30 fps; the handle pauses before it seeks. */
  step(frames: number): void;
  /** Nudge the playhead by seconds; arrow keys outside the editor use this. */
  seekBy?(seconds: number): void;
  toggleFullscreen?(): void;
  toggleMute?(): void;
}

/** Translates one shortcut action into calls on the handle. */
export function applyPlaybackAction(handle: PlaybackShortcutHandle, action: PlaybackAction) {
  switch (action) {
    case "toggle":
      handle.toggle();
      break;
    case "pause":
      handle.pause();
      break;
    case "reverse":
      handle.playAt(nextShuttleRate(handle.rate, -1, handle.playing));
      break;
    case "forward":
      handle.playAt(nextShuttleRate(handle.rate, 1, handle.playing));
      break;
    case "reverseNormal":
      handle.playAt(-1);
      break;
    case "slowReverse":
      handle.playAt(-0.5);
      break;
    case "slowForward":
      handle.playAt(0.5);
      break;
    case "stepBackTen":
      handle.step(-10);
      break;
    case "stepForwardTen":
      handle.step(10);
      break;
    case "stepBack":
      handle.step(-1);
      break;
    case "stepForward":
      handle.step(1);
      break;
    case "seekBack":
      handle.seekBy?.(-PUBLIC_SEEK_SECONDS);
      break;
    case "seekForward":
      handle.seekBy?.(PUBLIC_SEEK_SECONDS);
      break;
    case "fullscreen":
      handle.toggleFullscreen?.();
      break;
    case "mute":
      handle.toggleMute?.();
      break;
    case "handled":
      break;
  }
}

export type ChordAction =
  | "pause"
  | "stepBack"
  | "stepForward"
  | "slowReverse"
  | "slowForward";

export interface ChordClock {
  schedule(callback: () => void, ms: number): number;
  cancel(id: number): void;
}

const defaultChordClock: ChordClock = {
  schedule: (callback, ms) => window.setTimeout(callback, ms),
  cancel: (id) => window.clearTimeout(id),
};

/**
 * Tracks the Final Cut K chord: hold K and tap J or L to step one frame, or
 * keep both keys held past the delay to run at half speed. Releasing either
 * key pauses. Modifier keydowns clear the chord.
 */
export function createChordTracker(
  dispatch: (action: ChordAction) => void,
  clock: ChordClock = defaultChordClock,
) {
  let heldK = false;
  let direction: "j" | "l" | null = null;
  let chord = false;
  let holdTimer: number | undefined;

  function stopChord() {
    if (holdTimer !== undefined) clock.cancel(holdTimer);
    holdTimer = undefined;
    if (chord) dispatch("pause");
    chord = false;
  }
  function reset() {
    stopChord();
    heldK = false;
    direction = null;
  }
  return {
    /** Feed a mapped keydown; returns true when the chord consumed it. */
    keyDown(event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey">): boolean {
      const key = event.key.toLowerCase();
      if (event.altKey || event.shiftKey) reset();
      else if (key === "k") heldK = true;
      else if (key === "j" || key === "l") direction = key;
      else reset();
      if (heldK && direction) {
        stopChord();
        chord = true;
        dispatch(direction === "j" ? "stepBack" : "stepForward");
        holdTimer = clock.schedule(
          () => {
            holdTimer = undefined;
            dispatch(direction === "j" ? "slowReverse" : "slowForward");
          },
          HALF_SPEED_DELAY_MS,
        );
        return true;
      }
      return false;
    },
    keyUp(key: string) {
      const lowered = key.toLowerCase();
      if (lowered === "k") {
        stopChord();
        heldK = false;
      }
      if (lowered === direction) {
        stopChord();
        direction = null;
      }
    },
    /** Forget the chord and cancel a pending half-speed engagement. */
    reset,
  };
}

export interface PlaybackShortcutOptions {
  /** Element that anchors the shortcut scope. */
  root: HTMLElement;
  /** Editor mode adds J/L shuttling, frame steps, and K chords on document keys. */
  editor?: boolean;
  /** Selector for an ancestor that widens the scope; defaults to the editor marker. */
  scopeSelector?: string;
  /** Notified for every dispatched action, before the handle runs it. */
  onAction?: (action: PlaybackAction) => void;
}

/**
 * Binds the Final Cut playback shortcuts to a controller handle. Editor mode
 * listens on the document and keeps keys inside the editor boundary; public
 * players listen on the root itself. Returns an unbind function.
 */
export function bindPlaybackShortcuts(
  handle: PlaybackShortcutHandle,
  { root, editor = false, scopeSelector = VIDEO_EDITOR_SCOPE, onAction }: PlaybackShortcutOptions,
): () => void {
  const boundary = root.closest(scopeSelector) ?? root;
  const listenerTarget = editor ? document : root;
  let pointerFocused = false;
  const chord = createChordTracker(dispatch);

  function dispatch(action: PlaybackAction) {
    onAction?.(action);
    applyPlaybackAction(handle, action);
  }
  function reset() {
    chord.reset();
  }
  function inScope(target: EventTarget | null) {
    return (
      target instanceof Element &&
      (boundary.contains(target) || (editor && target === document.body))
    );
  }
  function pointerDown(event: PointerEvent) {
    pointerFocused = inScope(event.target);
  }
  function focusIn(event: FocusEvent) {
    if (
      !inScope(event.target) ||
      (event.target instanceof Element && event.target.closest(INTERACTIVE))
    )
      reset();
  }
  function keyDown(event: Event) {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === "Tab") {
      pointerFocused = false;
      reset();
    }
    if (!inScope(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    const action = playbackShortcut(event, target, editor, editor && pointerFocused);
    if (!action) {
      reset();
      return;
    }
    event.preventDefault();
    if (action === "handled") return;
    if (editor && chord.keyDown(event)) return;
    dispatch(action);
  }
  function keyUp(event: KeyboardEvent) {
    chord.keyUp(event.key);
  }
  function visibilityChange() {
    if (document.hidden) reset();
  }
  listenerTarget.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
  document.addEventListener("pointerdown", pointerDown);
  document.addEventListener("focusin", focusIn);
  document.addEventListener("visibilitychange", visibilityChange);
  window.addEventListener("blur", reset);
  return () => {
    reset();
    listenerTarget.removeEventListener("keydown", keyDown);
    document.removeEventListener("keyup", keyUp);
    document.removeEventListener("pointerdown", pointerDown);
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("visibilitychange", visibilityChange);
    window.removeEventListener("blur", reset);
  };
}
