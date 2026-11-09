/** Reverse and 32x use timed seeks; native playback rates stay positive and at most 16x. */
export function createShuttleController(
  video: HTMLVideoElement,
  onChange: (playing: boolean, rate: number) => void,
  clock = {
    now: () => performance.now(),
    schedule: (callback: () => void) => window.setTimeout(callback, 1000 / 30),
    cancel: (id: number) => window.clearTimeout(id),
  },
) {
  let rate = video.playbackRate || 1;
  let seekingPlayback = false;
  let timer: number | undefined;
  let previousTime = 0;
  let generation = 0;

  function playing() {
    return seekingPlayback || !video.paused;
  }

  function stopSeeking() {
    seekingPlayback = false;
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  }

  function pause() {
    generation++;
    stopSeeking();
    video.pause();
    onChange(false, rate);
  }

  function tick() {
    if (!seekingPlayback) return;
    const now = clock.now();
    // Do not jump across the clip when a background tab is throttled.
    const elapsed = Math.min((now - previousTime) / 1000, 0.25);
    if (!video.seeking && video.readyState >= 2) {
      const end = Number.isFinite(video.duration) ? video.duration : Infinity;
      const next = Math.min(end, Math.max(0, video.currentTime + rate * elapsed));
      video.currentTime = next;
      previousTime = now;
      if (next === 0 || next === end) {
        pause();
        return;
      }
    }
    timer = clock.schedule(tick);
  }

  function play() {
    const attempt = ++generation;
    stopSeeking();
    if (rate < 0 || rate > 16) {
      if (rate < 0 && video.currentTime <= 0) return pause();
      if (rate > 0 && video.ended) video.currentTime = 0;
      seekingPlayback = true;
      video.pause();
      previousTime = clock.now();
      timer = clock.schedule(tick);
      onChange(true, rate);
    } else {
      video.playbackRate = rate;
      void video.play().catch(() => {
        if (attempt === generation) onChange(false, rate);
      });
      onChange(true, rate);
    }
  }

  return {
    get playing() {
      return playing();
    },
    get rate() {
      return rate;
    },
    pause,
    play,
    toggle() {
      if (playing()) pause();
      else play();
    },
    shuttle(direction: -1 | 1) {
      const sameDirection = playing() && Math.sign(rate) === direction;
      const nextSpeed = sameDirection
        ? ([1, 2, 4, 8, 16, 32].find((speed) => speed > Math.abs(rate)) ?? 32)
        : 1;
      rate = direction * nextSpeed;
      play();
    },
    setRate(next: number) {
      const wasPlaying = playing();
      stopSeeking();
      rate = next;
      video.playbackRate = Math.min(Math.abs(next), 16);
      if (wasPlaying) play();
      else onChange(false, rate);
    },
    playAt(next: number) {
      rate = next;
      play();
    },
    step(frames: number, frameRate = 30) {
      pause();
      const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.max(0, Math.min(duration, video.currentTime + frames / frameRate));
    },
    dispose() {
      generation++;
      stopSeeking();
    },
  };
}

const INTERACTIVE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menu"], [role="listbox"], [role="dialog"]';

export function playbackShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "altKey"
    | "ctrlKey"
    | "metaKey"
    | "shiftKey"
    | "repeat"
    | "isComposing"
    | "defaultPrevented"
  > & { code?: string },
  target: { closest: (selector: string) => unknown } | null,
  editor: boolean,
  pointerFocused = false,
) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    target?.closest(INTERACTIVE)
  )
    return null;
  const key = event.key.toLowerCase();
  if (event.altKey) {
    if (!editor || event.shiftKey) return null;
    const code = event.code || `Key${key.toUpperCase()}`;
    if (code === "KeyJ" || code === "KeyL") {
      if (event.repeat) return "handled";
      return code === "KeyJ" ? "slowReverse" : "slowForward";
    }
    return null;
  }
  if (editor && event.shiftKey && key === " ") return event.repeat ? "handled" : "reverseNormal";
  if (event.shiftKey && !(editor && ["arrowleft", "arrowright"].includes(key))) return null;
  // Keyboard-focused buttons keep their native Space/arrow behavior; mouse-focused ones don't.
  if (
    !pointerFocused &&
    target?.closest("button, a[href]") &&
    [" ", "arrowleft", "arrowright"].includes(key)
  )
    return null;
  if (event.repeat && [" ", "k", "f", "m", ...(editor ? ["j", "l"] : [])].includes(key))
    return "handled";
  if (key === " ") return "toggle";
  if (key === "k") return "pause";
  if (key === "f") return "fullscreen";
  if (key === "m") return "mute";
  if (editor && key === "j") return "reverse";
  if (editor && key === "l") return "forward";
  if (editor && key === ",") return "stepBack";
  if (editor && key === ".") return "stepForward";
  if (key === "arrowleft")
    return editor ? (event.shiftKey ? "stepBackTen" : "stepBack") : "seekBack";
  if (key === "arrowright")
    return editor ? (event.shiftKey ? "stepForwardTen" : "stepForward") : "seekForward";
  return null;
}

export type PlaybackAction = NonNullable<ReturnType<typeof playbackShortcut>>;

// Shortcut BINDING lives in ./bindPlaybackShortcuts (handle-based, testable chord
// tracker). Upstream shipped a binder inside this file too; it was deleted so the
// chord state machine exists exactly once.
