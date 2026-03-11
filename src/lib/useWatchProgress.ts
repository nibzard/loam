import { useCallback, useEffect, useRef } from "react";
import { Id } from "@convex/_generated/dataModel";

type RecordWatchTarget = {
  videoId?: Id<"videos">;
  publicId?: string;
  grantToken?: string;
};

type RecordWatchArgs = RecordWatchTarget & {
  clientId?: string;
  watchedSeconds?: number;
};

type RecordWatchResult = {
  recorded: boolean;
  capReached: boolean;
  usageKind: "member" | "shared" | null;
  consumedWatchSeconds: number;
  requestedWatchSeconds: number;
};

type RecordWatchFunction = (args: RecordWatchArgs) => Promise<RecordWatchResult>;

interface WatchProgressOptions {
  enabled: boolean;
  trackerKey?: string | null;
  getTarget: () => RecordWatchTarget;
  getClientId?: () => string | null;
  recordWatch: RecordWatchFunction;
  flushIntervalMs?: number;
  flushThresholdSeconds?: number;
  maxDeltaSeconds?: number;
  minReportSeconds?: number;
  onCapReached?: (args: { usageKind: "member" | "shared" | null }) => void;
}

const DEFAULT_FLUSH_INTERVAL_MS = 10000;
const DEFAULT_FLUSH_THRESHOLD_SECONDS = 5;
const DEFAULT_MAX_DELTA_SECONDS = 4;
const DEFAULT_MIN_REPORT_SECONDS = 1;

type WatchProgressMachineSnapshot = {
  generation: number;
  isCapReached: boolean;
  isFlushing: boolean;
  lastTime: number | null;
  pendingWatchSeconds: number;
};

type FlushStartArgs = {
  enabled: boolean;
  minReportSeconds: number;
  target: RecordWatchTarget;
};

type FlushStartResult =
  | {
      generation: number;
      requestedWatchSeconds: number;
      target: RecordWatchTarget;
    }
  | null;

type FlushFinishResult = {
  capReached: boolean;
  shouldStopTracking: boolean;
};

export function createWatchProgressMachine() {
  const state: WatchProgressMachineSnapshot = {
    generation: 0,
    isCapReached: false,
    isFlushing: false,
    lastTime: null,
    pendingWatchSeconds: 0,
  };

  return {
    reset() {
      state.generation += 1;
      state.isCapReached = false;
      state.isFlushing = false;
      state.lastTime = null;
      state.pendingWatchSeconds = 0;
    },

    trackTime({
      enabled,
      flushThresholdSeconds,
      maxDeltaSeconds,
      time,
    }: {
      enabled: boolean;
      flushThresholdSeconds: number;
      maxDeltaSeconds: number;
      time: number;
    }) {
      if (!enabled || state.isCapReached) return false;

      const normalizedTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      const lastTime = state.lastTime;
      state.lastTime = normalizedTime;

      if (lastTime === null) return false;

      const delta = normalizedTime - lastTime;
      if (delta <= 0) return false;

      const trackedDelta = Math.min(delta, maxDeltaSeconds);
      if (trackedDelta <= 0) return false;

      state.pendingWatchSeconds += trackedDelta;
      return state.pendingWatchSeconds >= flushThresholdSeconds;
    },

    startFlush({
      enabled,
      minReportSeconds,
      target,
    }: FlushStartArgs): FlushStartResult {
      if (!enabled || state.isCapReached || state.isFlushing) return null;

      if (!target.videoId && !target.publicId && !target.grantToken) {
        state.pendingWatchSeconds = 0;
        state.lastTime = null;
        return null;
      }

      const requestedWatchSeconds = Math.floor(state.pendingWatchSeconds);
      if (requestedWatchSeconds < minReportSeconds) return null;

      state.pendingWatchSeconds -= requestedWatchSeconds;
      state.isFlushing = true;

      return {
        generation: state.generation,
        requestedWatchSeconds,
        target,
      };
    },

    finishFlush(
      generation: number,
      result: RecordWatchResult,
    ): FlushFinishResult {
      if (generation === state.generation) {
        state.isFlushing = false;
      }

      if (generation !== state.generation) {
        return {
          capReached: state.isCapReached,
          shouldStopTracking: false,
        };
      }

      if (result.capReached && result.consumedWatchSeconds < result.requestedWatchSeconds) {
        state.isCapReached = true;
        state.pendingWatchSeconds = 0;
        return {
          capReached: true,
          shouldStopTracking: true,
        };
      }

      if (!result.recorded || result.consumedWatchSeconds <= 0) {
        state.pendingWatchSeconds += result.requestedWatchSeconds;
      }

      return {
        capReached: state.isCapReached,
        shouldStopTracking: false,
      };
    },

    failFlush(generation: number, requestedWatchSeconds: number) {
      if (generation === state.generation) {
        state.isFlushing = false;
      }

      if (generation !== state.generation) return;

      state.pendingWatchSeconds += requestedWatchSeconds;
    },

    snapshot() {
      return { ...state };
    },
  };
}

export function useWatchProgress({
  enabled,
  trackerKey,
  getTarget,
  getClientId,
  recordWatch,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  flushThresholdSeconds = DEFAULT_FLUSH_THRESHOLD_SECONDS,
  maxDeltaSeconds = DEFAULT_MAX_DELTA_SECONDS,
  minReportSeconds = DEFAULT_MIN_REPORT_SECONDS,
  onCapReached,
}: WatchProgressOptions) {
  const machineRef = useRef<ReturnType<typeof createWatchProgressMachine> | null>(null);
  const intervalRef = useRef<number | null>(null);

  if (machineRef.current === null) {
    machineRef.current = createWatchProgressMachine();
  }

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearTimer();
    machineRef.current?.reset();
  }, [clearTimer]);

  const flush = useCallback(async () => {
    const machine = machineRef.current;
    if (!machine) return;

    const target = getTarget();
    const started = machine.startFlush({
      enabled,
      minReportSeconds,
      target,
    });
    if (!started) return;

    try {
      const result = await recordWatch({
        ...started.target,
        clientId: getClientId?.(),
        watchedSeconds: started.requestedWatchSeconds,
      });

      const finish = machine.finishFlush(started.generation, result);
      if (finish.capReached && finish.shouldStopTracking) {
        onCapReached?.({ usageKind: result.usageKind });
        clearTimer();
      }
    } catch {
      machine.failFlush(started.generation, started.requestedWatchSeconds);
    }
  }, [
    enabled,
    getTarget,
    getClientId,
    minReportSeconds,
    clearTimer,
    onCapReached,
    recordWatch,
  ]);

  const flushLoop = useCallback(() => {
    void flush();
  }, [flush]);

  useEffect(() => {
    void flush();
    resetState();
  }, [trackerKey, flush, resetState]);

  useEffect(() => {
    if (!enabled || machineRef.current?.snapshot().isCapReached) return;

    intervalRef.current = window.setInterval(flushLoop, flushIntervalMs);
    return () => {
      clearTimer();
    };
  }, [clearTimer, enabled, flushIntervalMs, flushLoop]);

  useEffect(() => {
    return () => {
      clearTimer();
      void flush();
    };
  }, [clearTimer, flush]);

  const trackTime = useCallback(
    (time: number) => {
      const shouldFlush = machineRef.current?.trackTime({
        enabled,
        flushThresholdSeconds,
        maxDeltaSeconds,
        time,
      });
      if (shouldFlush) {
        void flush();
      }
    },
    [enabled, flush, flushThresholdSeconds, maxDeltaSeconds],
  );

  return { trackTime };
}
