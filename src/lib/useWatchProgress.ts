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
  const lastTimeRef = useRef<number | null>(null);
  const pendingWatchSecondsRef = useRef(0);
  const isCapReachedRef = useRef(false);
  const isFlushingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearTimer();
    lastTimeRef.current = null;
    pendingWatchSecondsRef.current = 0;
    isCapReachedRef.current = false;
  }, [clearTimer]);

  const flush = useCallback(async () => {
    if (!enabled || isCapReachedRef.current || isFlushingRef.current) return;

    const target = getTarget();
    if (!target.videoId && !target.publicId && !target.grantToken) {
      pendingWatchSecondsRef.current = 0;
      lastTimeRef.current = null;
      return;
    }

    const requestedWatchSeconds = Math.floor(pendingWatchSecondsRef.current);
    if (requestedWatchSeconds < minReportSeconds) return;

    pendingWatchSecondsRef.current -= requestedWatchSeconds;
    isFlushingRef.current = true;

    try {
      const result = await recordWatch({
        ...target,
        clientId: getClientId?.(),
        watchedSeconds: requestedWatchSeconds,
      });

      if (result.capReached && result.consumedWatchSeconds < result.requestedWatchSeconds) {
        isCapReachedRef.current = true;
        pendingWatchSecondsRef.current = 0;
        onCapReached?.({ usageKind: result.usageKind });
        clearTimer();
        return;
      }

      if (!result.recorded || result.consumedWatchSeconds <= 0) {
        pendingWatchSecondsRef.current += requestedWatchSeconds;
      }
    } catch {
      pendingWatchSecondsRef.current += requestedWatchSeconds;
    } finally {
      isFlushingRef.current = false;
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
    if (!enabled || isCapReachedRef.current) return;

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
      if (!enabled || isCapReachedRef.current) return;

      const normalizedTime = Number.isFinite(time) ? Math.max(0, time) : 0;
      const lastTime = lastTimeRef.current;
      lastTimeRef.current = normalizedTime;

      if (lastTime === null) return;

      const delta = normalizedTime - lastTime;
      if (delta <= 0) return;

      const trackedDelta = Math.min(delta, maxDeltaSeconds);
      if (trackedDelta <= 0) return;

      pendingWatchSecondsRef.current += trackedDelta;
      if (pendingWatchSecondsRef.current >= flushThresholdSeconds) {
        void flush();
      }
    },
    [enabled, flush, flushThresholdSeconds, maxDeltaSeconds, minReportSeconds],
  );

  return { trackTime };
}
