"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateViewerClientId } from "./viewerClientId";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DISCONNECT_PATH = "videoPresence:disconnect";

export type VideoWatcher = {
  userId: string;
  online: boolean;
  kind: "member" | "guest";
  displayName: string;
  avatarUrl?: string;
};

export function useVideoPresence(input: {
  videoId?: Id<"videos">;
  enabled?: boolean;
  shareGrantToken?: string;
  intervalMs?: number;
  sessionKey?: string;
}) {
  const convex = useConvex();
  const heartbeat = useMutation(api.videoPresence.heartbeat);
  const disconnect = useMutation(api.videoPresence.disconnect);

  const [clientId, setClientId] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const heartbeatInFlightRef = useRef(false);
  const hasMountedRef = useRef(false);

  const {
    videoId,
    enabled = true,
    shareGrantToken,
    intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    sessionKey = "anonymous",
  } = input;

  const sessionId = useMemo(
    () => crypto.randomUUID(),
    [clientId, sessionKey, shareGrantToken, videoId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setClientId(getOrCreateViewerClientId());
  }, []);

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    heartbeatInFlightRef.current = false;
    setRoomToken(null);
    setSessionToken(null);

    const previousSessionToken = sessionTokenRef.current;
    sessionTokenRef.current = null;

    if (previousSessionToken) {
      void disconnect({ sessionToken: previousSessionToken }).catch(() => {
        // Ignore teardown failures while rotating presence sessions.
      });
    }
  }, [disconnect, sessionId]);

  useEffect(() => {
    if (!enabled || !videoId || !clientId) {
      setRoomToken(null);
      setSessionToken(null);
      return;
    }

    let active = true;

    const runHeartbeat = async () => {
      if (heartbeatInFlightRef.current) {
        return;
      }

      heartbeatInFlightRef.current = true;
      try {
        const result = await heartbeat({
          videoId,
          sessionId,
          clientId,
          interval: intervalMs,
          shareGrantToken,
        });

        if (!active) return;
        setSessionToken(result.sessionToken);
        setRoomToken(result.roomToken);
      } catch (error) {
        if (active) {
          console.error("Failed to update video presence heartbeat", error);
        }
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };

    const handleBeforeUnload = () => {
      if (!sessionTokenRef.current) return;

      const payload = {
        path: DISCONNECT_PATH,
        args: { sessionToken: sessionTokenRef.current },
      };

      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      navigator.sendBeacon(`${convex.url}/api/mutation`, blob);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (sessionTokenRef.current) {
          void disconnect({ sessionToken: sessionTokenRef.current }).catch(() => {
            // Ignore disconnect failures when the page is backgrounded.
          });
        }
        return;
      }

      void runHeartbeat();
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        void runHeartbeat();
      }, intervalMs);
    };

    void runHeartbeat();
    intervalRef.current = window.setInterval(() => {
      void runHeartbeat();
    }, intervalMs);

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      setRoomToken(null);
      if (hasMountedRef.current && sessionTokenRef.current) {
        void disconnect({ sessionToken: sessionTokenRef.current }).catch(() => {
          // Ignore disconnect failures during teardown.
        });
      }
    };
  }, [clientId, convex.url, disconnect, enabled, heartbeat, intervalMs, sessionId, shareGrantToken, videoId]);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  const state = useQuery(
    api.videoPresence.list,
    roomToken ? { roomToken } : "skip",
  );

  const watchers = useMemo(() => {
    if (!state) return [];

    return state
      .filter((watcher) => watcher.online)
      .map((watcher) => ({
        userId: watcher.userId,
        online: watcher.online,
        kind: watcher.data?.kind ?? "member",
        displayName: watcher.data?.displayName ?? "Member",
        avatarUrl: watcher.data?.avatarUrl,
      })) satisfies VideoWatcher[];
  }, [state]);

  return {
    watchers,
    isLoading: roomToken !== null && state === undefined,
  };
}
