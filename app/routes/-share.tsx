import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useLoaderData, useParams } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Lock, Video } from "lucide-react";

import { DeferredPublicAuthBridge } from "@/components/public/DeferredPublicAuthBridge";
import { PublicDiscussionControls } from "@/components/public/PublicDiscussionControls";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { summarizeReactions } from "@/components/reactions/ReactionBar";
import { LazyVideoPlayer, preloadVideoPlayer, type VideoPlayerHandle } from "@/components/video-player/lazy";
import { WatchCapNotice } from "@/components/video-player/WatchCapNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import {
  PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS,
  PLAYBACK_SESSION_REFRESH_LEAD_MS,
  type PlaybackSession,
} from "@/lib/playbackSession";
import { usePublicViewerAuth } from "@/lib/publicViewerAuth";
import { formatDuration, formatRelativeTime, formatTimestamp } from "@/lib/utils";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { getOrCreateViewerClientId } from "@/lib/viewerClientId";
import { useWatchProgress } from "@/lib/useWatchProgress";

import { isReadyShareBootstrap } from "./-publicPlaybackLoaders";
import { prewarmShare, useShareData } from "./-share.data";

function formatRetryDelay(retryAfterSeconds: number | null | undefined) {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    return null;
  }

  if (retryAfterSeconds < 60) {
    return `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function SharePage() {
  const params = useParams({ strict: false });
  const token = params.token as string;
  const convex = useConvex();
  const loaderBootstrap = useLoaderData({ from: "/share/$token" });

  const createComment = useMutation(api.comments.createForShareGrant);
  const createReaction = useMutation(api.reactions.createForShareGrant);
  const requestPlaybackBootstrap = useAction(api.videoActions.getSharePlaybackBootstrap);
  const getSharedDownloadUrl = useAction(api.videoActions.getSharedDownloadUrl);
  const getPlaybackSession = useAction(api.videoActions.getSharedPlaybackSession);
  const recordWatch = useAction(api.watchEventActions.recordWatch);

  const [bootstrap, setBootstrap] = useState(loaderBootstrap);
  const [passwordInput, setPasswordInput] = useState("");
  const [isRequestingGrant, setIsRequestingGrant] = useState(false);
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(
    isReadyShareBootstrap(loaderBootstrap) ? loaderBootstrap.playbackSession : null,
  );
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [viewerClientId, setViewerClientId] = useState<string | null>(null);
  const [watchCapKind, setWatchCapKind] = useState<"member" | "shared" | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const playbackRefreshInFlightRef = useRef(false);
  const playbackSessionKeyRef = useRef(0);
  const lastPlaybackAccessErrorAtRef = useRef(0);
  const { user, isLoaded: isPublicViewerLoaded } = usePublicViewerAuth();

  useEffect(() => {
    setBootstrap(loaderBootstrap);
  }, [loaderBootstrap]);

  const readyBootstrap = isReadyShareBootstrap(bootstrap) ? bootstrap : null;
  const grantToken = readyBootstrap?.grantToken ?? null;

  const { videoData: liveVideoData, comments, reactions } = useShareData({
    token,
    grantToken,
  });
  const videoData =
    liveVideoData === undefined && readyBootstrap
      ? readyBootstrap.videoData
      : liveVideoData;
  const canTrackPresence = Boolean(playbackSession?.url && videoData?.video?._id);
  const { watchers } = useVideoPresence({
    videoId: videoData?.video?._id,
    enabled: canTrackPresence,
    shareGrantToken: grantToken ?? undefined,
    sessionKey: `${isPublicViewerLoaded ? "loaded" : "loading"}:${user?.id ?? "guest"}`,
  });
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(`/share/${token}`)}`;

  useEffect(() => {
    setPlaybackSession(readyBootstrap?.playbackSession ?? null);
    setPlaybackError(null);
    setIsLoadingPlayback(false);
    playbackRefreshInFlightRef.current = false;
    playbackSessionKeyRef.current += 1;
    lastPlaybackAccessErrorAtRef.current = 0;
  }, [readyBootstrap?.grantToken, readyBootstrap?.playbackSession]);

  useEffect(() => {
    setViewerClientId(getOrCreateViewerClientId());
  }, []);

  useEffect(() => {
    setWatchCapKind(null);
  }, [token]);

  useEffect(() => {
    if (!videoData?.video?._id) return;
    preloadVideoPlayer();
  }, [videoData?.video?._id]);

  useEffect(() => {
    if (!playbackSession?.url) return;
    prefetchHlsRuntime(playbackSession.url);
    prefetchPlaybackSource(playbackSession.url);
  }, [playbackSession?.url]);

  const refreshPlaybackSession = useCallback(
    async (options?: {
      failureMessage?: string;
      preserveExisting?: boolean;
    }) => {
      if (!grantToken || playbackRefreshInFlightRef.current) {
        return;
      }

      const requestKey = playbackSessionKeyRef.current;
      playbackRefreshInFlightRef.current = true;
      setIsLoadingPlayback(true);
      setPlaybackError(null);

      if (!options?.preserveExisting) {
        setPlaybackSession(null);
      }

      try {
        const session = await getPlaybackSession({ grantToken });
        if (requestKey !== playbackSessionKeyRef.current) {
          return;
        }

        setPlaybackSession(session);
      } catch {
        if (requestKey !== playbackSessionKeyRef.current) {
          return;
        }

        if (!options?.preserveExisting) {
          setPlaybackSession(null);
        }

        setPlaybackError(options?.failureMessage ?? "Unable to refresh playback session.");
      } finally {
        if (requestKey === playbackSessionKeyRef.current) {
          setIsLoadingPlayback(false);
        }
        playbackRefreshInFlightRef.current = false;
      }
    },
    [getPlaybackSession, grantToken],
  );

  useEffect(() => {
    if (
      !grantToken ||
      playbackSession?.accessMode !== "signed" ||
      playbackSession.expiresAt === null
    ) {
      return;
    }

    const refreshDelay = Math.max(
      0,
      playbackSession.expiresAt - Date.now() - PLAYBACK_SESSION_REFRESH_LEAD_MS,
    );

    const timeout = window.setTimeout(() => {
      void refreshPlaybackSession({
        failureMessage: "Unable to refresh playback session.",
        preserveExisting: true,
      });
    }, refreshDelay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [grantToken, playbackSession, refreshPlaybackSession]);

  const handlePlaybackAccessError = useCallback(() => {
    if (!grantToken || playbackSession?.accessMode !== "signed") {
      return;
    }

    const now = Date.now();
    if (
      now - lastPlaybackAccessErrorAtRef.current <
      PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS
    ) {
      return;
    }

    lastPlaybackAccessErrorAtRef.current = now;
    void refreshPlaybackSession({
      failureMessage: "Playback access expired. Try refreshing the page.",
      preserveExisting: true,
    });
  }, [grantToken, playbackSession?.accessMode, refreshPlaybackSession]);

  const flattenedComments = useMemo(() => {
    if (!comments) return [] as Array<{ _id: string; timestampSeconds: number; resolved: boolean }>;

    const markers: Array<{ _id: string; timestampSeconds: number; resolved: boolean }> = [];
    for (const comment of comments) {
      markers.push({
        _id: comment._id,
        timestampSeconds: comment.timestampSeconds,
        resolved: comment.resolved,
      });
      for (const reply of comment.replies) {
        markers.push({
          _id: reply._id,
          timestampSeconds: reply.timestampSeconds,
          resolved: reply.resolved,
        });
      }
    }
    return markers;
  }, [comments]);

  const { trackTime } = useWatchProgress({
    enabled: Boolean(playbackSession?.url && videoData?.video?._id && grantToken && !watchCapKind),
    trackerKey: `${token}:${videoData?.video?._id ?? "pending"}:${grantToken ?? "pending"}`,
    getTarget: () => ({ grantToken: grantToken ?? "" }),
    getClientId: () => {
      const nextClientId = viewerClientId ?? getOrCreateViewerClientId();
      if (!viewerClientId && nextClientId) {
        setViewerClientId(nextClientId);
      }
      return nextClientId ?? undefined;
    },
    recordWatch,
    onCapReached: ({ usageKind }) => {
      if (usageKind) {
        setWatchCapKind(usageKind);
      }
    },
  });

  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime(time);
      trackTime(time);
    },
    [trackTime],
  );

  const reactionSummary = useMemo(
    () => summarizeReactions(reactions),
    [reactions],
  );

  const requestDownload = useCallback(async () => {
    if (!grantToken || !videoData?.allowDownload) return null;

    try {
      return await getSharedDownloadUrl({ grantToken });
    } catch (error) {
      console.error("Failed to prepare shared download:", error);
      return null;
    }
  }, [getSharedDownloadUrl, grantToken, videoData?.allowDownload]);

  const handleSubmitComment = useCallback(
    async ({ text, timestampSeconds }: { text: string; timestampSeconds: number }) => {
      if (!grantToken) {
        throw new Error("Missing share grant token");
      }

      await createComment({
        grantToken,
        text,
        timestampSeconds,
      });
    },
    [createComment, grantToken],
  );

  const handleAddReaction = useCallback(
    async (emoji: "👍" | "❤️" | "😂" | "🎉" | "😮" | "🔥") => {
      if (!grantToken) {
        throw new Error("Missing share grant token");
      }

      await createReaction({
        grantToken,
        emoji,
        timestampSeconds: currentTime,
      });
    },
    [createReaction, currentTime, grantToken],
  );

  const handleAcquireGrant = useCallback(
    async (password?: string) => {
      if (isRequestingGrant) return;

      setIsRequestingGrant(true);
      try {
        const nextBootstrap = await requestPlaybackBootstrap({ token, password });
        setBootstrap(nextBootstrap);

        if (isReadyShareBootstrap(nextBootstrap)) {
          setPasswordInput("");
          prewarmShare(convex, {
            token,
            grantToken: nextBootstrap.grantToken,
          });
          prefetchHlsRuntime(nextBootstrap.playbackSession.url);
          prefetchPlaybackSource(nextBootstrap.playbackSession.url);
        }
      } finally {
        setIsRequestingGrant(false);
      }
    },
    [convex, isRequestingGrant, requestPlaybackBootstrap, token],
  );

  if (bootstrap.state === "bootstrapping") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--foreground-muted)]">Opening shared video...</div>
      </div>
    );
  }

  if (bootstrap.state === "missing" || bootstrap.state === "expired") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--destructive)]/10 flex items-center justify-center mb-4 border-2 border-[var(--destructive)]">
              <AlertCircle className="h-6 w-6 text-[var(--destructive)]" />
            </div>
            <CardTitle>Link expired or invalid</CardTitle>
            <CardDescription>
              This share link is no longer valid. Please ask the video owner for a new link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">
                Go to loam
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (bootstrap.state === "processing") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
              <Video className="h-6 w-6 text-[var(--foreground-muted)]" />
            </div>
            <CardTitle>Video is still processing</CardTitle>
            <CardDescription>
              This share link is valid, but the upload is still being prepared for playback.
              Leave this page open or refresh in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (bootstrap.state === "failed") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--destructive)]/10 flex items-center justify-center mb-4 border-2 border-[var(--destructive)]">
              <AlertCircle className="h-6 w-6 text-[var(--destructive)]" />
            </div>
            <CardTitle>Video processing failed</CardTitle>
            <CardDescription>
              This upload could not be prepared for playback. Ask the owner to re-upload the file.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (bootstrap.state === "passwordRequired" || bootstrap.state === "passwordRejected") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
              <Lock className="h-6 w-6 text-[var(--foreground-muted)]" />
            </div>
            <CardTitle>Password required</CardTitle>
            <CardDescription>
              This video is password protected. Enter the password to view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleAcquireGrant(passwordInput);
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                autoFocus
              />
              {bootstrap.state === "passwordRejected" ? (
                <p className="text-sm text-[var(--destructive)]">Incorrect password</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={!passwordInput || isRequestingGrant}>
                {isRequestingGrant ? "Verifying..." : "View video"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (bootstrap.state === "temporarilyUnavailable") {
    const retryDelayLabel = formatRetryDelay(bootstrap.retryAfterSeconds);

    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
              <AlertCircle className="h-6 w-6 text-[var(--foreground-muted)]" />
            </div>
            <CardTitle>Unable to open this share right now</CardTitle>
            <CardDescription>
              {retryDelayLabel
                ? `This link is temporarily throttled. Try again in about ${retryDelayLabel}.`
                : "The share link could not be opened right now. Try again in a moment."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => {
                void handleAcquireGrant(passwordInput || undefined);
              }}
              disabled={isRequestingGrant}
            >
              {isRequestingGrant ? "Retrying..." : "Try again"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!videoData?.video) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--surface-alt)] flex items-center justify-center mb-4 border-2 border-[var(--border)]">
              <Video className="h-6 w-6 text-[var(--foreground-muted)]" />
            </div>
            <CardTitle>Video not available</CardTitle>
            <CardDescription>
              This video is not available or is still processing.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const video = videoData.video;
  const fallbackPosterUrl =
    playbackSession?.posterUrl ?? (video.thumbnailUrl?.startsWith("http") ? video.thumbnailUrl : undefined);
  const playerFallback = (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--media-border)] bg-[var(--media-background)] shadow-[0_10px_40px_var(--media-shadow)]">
      {fallbackPosterUrl ? (
        <img
          src={fallbackPosterUrl}
          alt={`${video.title} thumbnail`}
          className="h-full w-full object-cover blur-[4px]"
        />
      ) : null}
      <div className="absolute inset-0 bg-[var(--media-overlay)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--media-text)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--media-outline)] border-t-[var(--media-text-subtle)]" />
        <p className="text-sm font-medium text-[var(--media-text-dim)]">
          {playbackSession?.url ? "Loading player..." : playbackError ?? (isLoadingPlayback ? "Loading stream..." : "Preparing stream...")}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <DeferredPublicAuthBridge enabled={Boolean(playbackSession?.url)} />

      <div className="min-h-screen bg-[var(--background)]">
        <header className="bg-[var(--background)] border-b-2 border-[var(--border)] px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link
              preload="intent"
              to="/"
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] text-sm flex items-center gap-2 font-bold"
            >
              loam
            </Link>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-black text-[var(--foreground)]">{video.title}</h1>
            {video.description ? (
              <p className="text-[var(--foreground-muted)] mt-1">{video.description}</p>
            ) : null}
            <div className="flex items-center gap-4 mt-2 text-sm text-[var(--foreground-muted)]">
              {video.duration ? <span className="font-mono">{formatDuration(video.duration)}</span> : null}
              {comments ? <span>{comments.length} threads</span> : null}
              <VideoWatchers watchers={watchers} className="ml-auto" />
            </div>
          </div>

          <div className="border-2 border-[var(--border)] overflow-hidden">
            {watchCapKind ? (
              <WatchCapNotice usageKind={watchCapKind} />
            ) : playbackSession?.url ? (
              <Suspense fallback={playerFallback}>
              <LazyVideoPlayer
                ref={playerRef}
                src={playbackSession.url}
                poster={playbackSession.posterUrl}
                comments={flattenedComments}
                onTimeUpdate={handleTimeUpdate}
                onPlaybackAccessError={handlePlaybackAccessError}
                allowDownload={videoData.allowDownload}
                onRequestDownload={requestDownload}
              />
              </Suspense>
            ) : (
              playerFallback
            )}
          </div>

          <section className="border-2 border-[var(--border)] bg-[var(--surface-alt)] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-[var(--foreground)]">Comments</h2>
              <span className="text-xs text-[var(--foreground-muted)] font-mono">{formatTimestamp(currentTime)}</span>
            </div>

            <PublicDiscussionControls
              counts={reactionSummary}
              currentTime={currentTime}
              onReact={handleAddReaction}
              onSubmitComment={handleSubmitComment}
              signInHref={signInHref}
            />

            {comments === undefined ? (
              <p className="text-sm text-[var(--foreground-muted)]">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <article key={comment._id} className="border-2 border-[var(--border)] bg-[var(--background)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-[var(--foreground)]">{comment.userName}</div>
                      <button
                        type="button"
                        className="font-mono text-xs text-[var(--accent)] hover:text-[var(--foreground)]"
                        onClick={() => playerRef.current?.seekTo(comment.timestampSeconds, { play: true })}
                      >
                        {formatTimestamp(comment.timestampSeconds)}
                      </button>
                    </div>
                    <p className="text-sm text-[var(--foreground)] mt-1 whitespace-pre-wrap">{comment.text}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)] mt-1">{formatRelativeTime(comment._creationTime)}</p>

                    {comment.replies.length > 0 ? (
                      <div className="mt-3 ml-4 border-l-2 border-[var(--border)] pl-3 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply._id} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[var(--foreground)]">{reply.userName}</span>
                              <button
                                type="button"
                                className="font-mono text-xs text-[var(--accent)] hover:text-[var(--foreground)]"
                                onClick={() => playerRef.current?.seekTo(reply.timestampSeconds, { play: true })}
                              >
                                {formatTimestamp(reply.timestampSeconds)}
                              </button>
                            </div>
                            <p className="text-[var(--foreground)] whitespace-pre-wrap">{reply.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <footer className="border-t-2 border-[var(--border)] px-6 py-4 mt-8">
          <div className="max-w-6xl mx-auto text-center text-sm text-[var(--foreground-muted)]">
            Shared via{" "}
            <Link to="/" preload="intent" className="text-[var(--foreground)] hover:text-[var(--accent)] font-bold">
              loam
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
}
