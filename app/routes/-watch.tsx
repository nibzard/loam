import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useParams } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LazyVideoPlayer, preloadVideoPlayer, type VideoPlayerHandle } from "@/components/video-player/lazy";
import { WatchCapNotice } from "@/components/video-player/WatchCapNotice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDuration, formatTimestamp, formatRelativeTime } from "@/lib/utils";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import { AlertCircle, MessageSquare, Clock, X } from "lucide-react";
import { ReactionBar, summarizeReactions } from "@/components/reactions/ReactionBar";
import { getOrCreateViewerClientId } from "@/lib/viewerClientId";
import { useWatchProgress } from "@/lib/useWatchProgress";
import { type PlaybackSession } from "@/lib/playbackSession";
import { useWatchData } from "./-watch.data";

export default function WatchPage() {
  const params = useParams({ strict: false });
  const publicId = params.publicId as string;
  const { user, isLoaded: isUserLoaded } = useUser();

  const createComment = useMutation(api.comments.createForPublic);
  const createReaction = useMutation(api.reactions.createForPublic);
  const getPlaybackSession = useAction(api.videoActions.getPublicPlaybackSession);
  const recordWatch = useAction(api.watchEventActions.recordWatch);

  const { videoData, comments, reactions } = useWatchData({ publicId });
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [viewerClientId, setViewerClientId] = useState<string | null>(null);
  const [watchCapKind, setWatchCapKind] = useState<"member" | "shared" | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);

  useEffect(() => {
    setViewerClientId(getOrCreateViewerClientId());
  }, []);

  useEffect(() => {
    setWatchCapKind(null);
  }, [publicId]);

  useEffect(() => {
    if (!videoData?.video?._id) return;
    preloadVideoPlayer();
    prefetchHlsRuntime();
  }, [videoData?.video?._id]);

  useEffect(() => {
    if (!videoData?.video?._id) {
      setPlaybackSession(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPlayback(true);
    setPlaybackError(null);

    void getPlaybackSession({ publicId })
      .then((session) => {
        if (cancelled) return;
        setPlaybackSession(session);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackError("Unable to load playback session.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getPlaybackSession, publicId, videoData?.video?._id]);

  useEffect(() => {
    if (!playbackSession?.url) return;
    prefetchPlaybackSource(playbackSession.url);
  }, [playbackSession?.url]);

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

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      await createComment({
        publicId,
        text: commentText.trim(),
        timestampSeconds: currentTime,
      });
      setCommentText("");
    } catch {
      setCommentError("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const { trackTime } = useWatchProgress({
    enabled: Boolean(playbackSession?.url && videoData?.video?._id && !watchCapKind),
    trackerKey: videoData?.video?._id ?? publicId,
    getTarget: () => ({ publicId }),
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

  const canReact = Boolean(isUserLoaded && user);

  const handleAddReaction = useCallback(
    async (emoji: "👍" | "❤️" | "😂" | "🎉" | "😮" | "🔥") => {
      if (!canReact) return;
      try {
        await createReaction({
          publicId,
          emoji,
          timestampSeconds: currentTime,
        });
      } catch (error) {
        console.error("Failed to post reaction:", error);
      }
    },
    [canReact, createReaction, currentTime, publicId],
  );

  if (videoData === undefined) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--foreground-muted)]">Loading...</div>
      </div>
    );
  }

  if (!videoData?.video) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[var(--destructive)]/10 flex items-center justify-center mb-4 border-2 border-[var(--destructive)]">
              <AlertCircle className="h-6 w-6 text-[var(--destructive)]" />
            </div>
            <CardTitle>Video unavailable</CardTitle>
            <CardDescription>
              This video is private, invalid, or no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">Go to loam</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const video = videoData.video;
  const playerFallback = (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-[var(--media-text)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--media-outline)] border-t-[var(--media-text-subtle)]" />
        <p className="text-sm font-medium text-[var(--media-text-dim)]">
          {playbackSession?.url ? "Loading player..." : playbackError ?? (isLoadingPlayback ? "Loading stream..." : "Preparing stream...")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="flex-shrink-0 bg-[var(--background)] border-b-2 border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            preload="intent"
            to="/"
            className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] text-sm flex items-center gap-2 font-bold"
          >
            loam
          </Link>
          <div className="h-4 w-[2px] bg-[var(--surface-strong)]/20" />
          <h1 className="text-base font-black truncate max-w-[150px] sm:max-w-[300px]">{video.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
          {video.duration && (
            <>
              <span className="hidden sm:inline text-[var(--foreground-muted)]">·</span>
              <span className="hidden sm:inline font-mono">{formatDuration(video.duration)}</span>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden h-8"
            onClick={() => setMobileCommentsOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
            {comments && comments.length > 0 && (
              <span className="ml-1.5 text-xs">{comments.length}</span>
            )}
          </Button>
        </div>
      </header>

      {/* Main content - horizontal split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--media-background)]">
          {watchCapKind ? (
            <WatchCapNotice usageKind={watchCapKind} controlsBelow />
          ) : playbackSession?.url ? (
            <Suspense fallback={playerFallback}>
              <LazyVideoPlayer
                ref={playerRef}
                src={playbackSession.url}
                poster={playbackSession.posterUrl}
                comments={flattenedComments}
                onTimeUpdate={handleTimeUpdate}
                allowDownload={false}
                controlsBelow
              />
            </Suspense>
          ) : (
            playerFallback
          )}
        </div>

        {/* Comments sidebar — desktop */}
        <aside className="hidden lg:flex w-80 xl:w-96 border-l-2 border-[var(--border)] flex-col bg-[var(--background)]">
          <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border)]/10 flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[var(--foreground)]">
              Discussion
            </h2>
            {comments && comments.length > 0 && (
              <span className="text-[11px] font-medium text-[var(--foreground-muted)] bg-[var(--surface-strong)]/5 px-2 py-0.5 rounded-full">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </span>
            )}
          </div>
          <div className="flex-shrink-0 px-5 py-3 border-b border-[var(--border)]/10">
            <ReactionBar
              counts={reactionSummary}
              onReact={handleAddReaction}
              disabled={!canReact}
            />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          </div>
          
          <div className="flex-shrink-0 border-t-2 border-[var(--border)] bg-[var(--background)] p-4">
            {isUserLoaded && user ? (
              <form onSubmit={handleSubmitComment} className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-subtle)]">
                  <Clock className="h-3.5 w-3.5" />
                  Comment at {formatTimestamp(currentTime)}
                </div>
                <Textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Leave a comment..."
                  className="min-h-[90px] text-sm"
                />
                {commentError ? <p className="text-xs text-[var(--destructive)]">{commentError}</p> : null}
                <Button type="submit" size="sm" disabled={!commentText.trim() || isSubmittingComment} className="w-full">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {isSubmittingComment ? "Posting..." : "Post comment"}
                </Button>
              </form>
            ) : (
              <a
                href={`/sign-in?redirect_url=${encodeURIComponent(`/watch/${publicId}`)}`}
                className="block"
              >
                <Button className="w-full">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  Sign in to comment
                </Button>
              </a>
            )}
          </div>
        </aside>
      </div>

      {/* Comments overlay — mobile */}
      {mobileCommentsOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col bg-[var(--background)]">
          <div className="flex-shrink-0 px-5 py-4 border-b-2 border-[var(--border)] flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[var(--foreground)]">
              Discussion
              {comments && comments.length > 0 && (
                <span className="text-[11px] font-medium text-[var(--foreground-muted)] bg-[var(--surface-strong)]/5 px-2 py-0.5 rounded-full">
                  {comments.length}
                </span>
              )}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileCommentsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-shrink-0 px-5 py-3 border-b border-[var(--border)]/10">
            <ReactionBar
              counts={reactionSummary}
              onReact={handleAddReaction}
              disabled={!canReact}
            />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        onClick={() => {
                          playerRef.current?.seekTo(comment.timestampSeconds, { play: true });
                          setMobileCommentsOpen(false);
                        }}
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
                                onClick={() => {
                                  playerRef.current?.seekTo(reply.timestampSeconds, { play: true });
                                  setMobileCommentsOpen(false);
                                }}
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
          </div>
          
          <div className="flex-shrink-0 border-t-2 border-[var(--border)] bg-[var(--background)] p-4 pb-safe">
            {isUserLoaded && user ? (
              <form onSubmit={handleSubmitComment} className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-subtle)]">
                  <Clock className="h-3.5 w-3.5" />
                  Comment at {formatTimestamp(currentTime)}
                </div>
                <Textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Leave a comment..."
                  className="min-h-[90px] text-sm"
                />
                {commentError ? <p className="text-xs text-[var(--destructive)]">{commentError}</p> : null}
                <Button type="submit" size="sm" disabled={!commentText.trim() || isSubmittingComment} className="w-full">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {isSubmittingComment ? "Posting..." : "Post comment"}
                </Button>
              </form>
            ) : (
              <a
                href={`/sign-in?redirect_url=${encodeURIComponent(`/watch/${publicId}`)}`}
                className="block"
              >
                <Button className="w-full">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  Sign in to comment
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
