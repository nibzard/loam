
import { useConvex, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LazyVideoPlayer, preloadVideoPlayer, type VideoPlayerHandle } from "@/components/video-player/lazy";
import { WatchCapNotice } from "@/components/video-player/WatchCapNotice";
import { CommentList } from "@/components/comments/CommentList";
import { CommentInput } from "@/components/comments/CommentInput";
import { ShareDialog } from "@/components/ShareDialog";
import { formatDuration } from "@/lib/utils";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { DashboardHeader } from "@/components/DashboardHeader";
import {
  Edit2,
  Check,
  X,
  Link as LinkIcon,
  MessageSquare,
  MoreVertical,
} from "lucide-react";
import { ReactionBar, summarizeReactions } from "@/components/reactions/ReactionBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "@convex/_generated/dataModel";
import { projectPath, teamHomePath } from "@/lib/routes";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import {
  PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS,
  PLAYBACK_SESSION_REFRESH_LEAD_MS,
  type PlaybackSession,
} from "@/lib/playbackSession";
import { useWatchProgress } from "@/lib/useWatchProgress";
import { prewarmProject } from "./-project.data";
import { prewarmTeam } from "./-team.data";
import { useVideoData } from "./-video.data";

export default function VideoPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";
  const projectId = params.projectId as Id<"projects">;
  const videoId = params.videoId as Id<"videos">;
  const convex = useConvex();

  const {
    context,
    resolvedTeamSlug,
    resolvedProjectId,
    resolvedVideoId,
    video,
    comments,
    commentsThreaded,
    reactions,
  } = useVideoData({
    teamSlug,
    projectId,
    videoId,
  });
  const updateVideo = useMutation(api.videos.update);
  const getPlaybackSession = useAction(api.videoActions.getPlaybackSession);
  const getOriginalPlaybackUrl = useAction(api.videoActions.getOriginalPlaybackUrl);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);
  const recordWatch = useAction(api.watchEventActions.recordWatch);
  const createReaction = useMutation(api.reactions.create);

  const [currentTime, setCurrentTime] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [highlightedCommentId, setHighlightedCommentId] = useState<Id<"comments"> | undefined>();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [originalPlaybackUrl, setOriginalPlaybackUrl] = useState<string | null>(null);
  const [isLoadingOriginalPlayback, setIsLoadingOriginalPlayback] = useState(false);
  const [preferredSource, setPreferredSource] = useState<"mux720" | "original">("original");
  const [watchCapKind, setWatchCapKind] = useState<"member" | "shared" | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const playbackRefreshInFlightRef = useRef(false);
  const playbackSessionKeyRef = useRef(0);
  const lastPlaybackAccessErrorAtRef = useRef(0);
  const isPlayable = video?.status === "ready" && Boolean(video?.muxPlaybackId);
  const playbackUrl = playbackSession?.url ?? null;
  const activePlaybackUrl =
    preferredSource === "mux720"
      ? playbackUrl ?? originalPlaybackUrl
      : originalPlaybackUrl ?? playbackUrl;
  const activeQualityId =
    activePlaybackUrl && playbackUrl && activePlaybackUrl === playbackUrl
      ? "mux720"
      : "original";
  const isUsingOriginalFallback = Boolean(activePlaybackUrl && activePlaybackUrl === originalPlaybackUrl && !playbackUrl);
  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;
  const prewarmTeamIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmTeam(convex, { teamSlug: resolvedTeamSlug }),
  );
  const prewarmProjectIntentHandlers = useRoutePrewarmIntent(() => {
    if (!resolvedProjectId) return;
    return prewarmProject(convex, {
      teamSlug: resolvedTeamSlug,
      projectId: resolvedProjectId,
    });
  });
  const { watchers } = useVideoPresence({
    videoId: resolvedVideoId,
    enabled: Boolean(resolvedVideoId),
  });

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  useEffect(() => {
    setWatchCapKind(null);
  }, [resolvedVideoId]);

  useEffect(() => {
    if (!video || video.status === "uploading" || video.status === "failed") return;
    preloadVideoPlayer();
  }, [video]);

  useEffect(() => {
    playbackRefreshInFlightRef.current = false;
    playbackSessionKeyRef.current += 1;
    lastPlaybackAccessErrorAtRef.current = 0;
  }, [resolvedVideoId, video?.muxPlaybackId]);

  const refreshPlaybackSession = useCallback(
    async (options?: { preserveExisting?: boolean }) => {
      if (!resolvedVideoId || playbackRefreshInFlightRef.current) {
        return;
      }

      const requestKey = playbackSessionKeyRef.current;
      playbackRefreshInFlightRef.current = true;
      setIsLoadingPlayback(true);

      if (!options?.preserveExisting) {
        setPlaybackSession(null);
      }

      try {
        const session = await getPlaybackSession({ videoId: resolvedVideoId });
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
      } finally {
        if (requestKey === playbackSessionKeyRef.current) {
          setIsLoadingPlayback(false);
        }
        playbackRefreshInFlightRef.current = false;
      }
    },
    [getPlaybackSession, resolvedVideoId],
  );

  useEffect(() => {
    if (!resolvedVideoId || !isPlayable) {
      setPlaybackSession(null);
      setIsLoadingPlayback(false);
      return;
    }

    void refreshPlaybackSession();
  }, [isPlayable, refreshPlaybackSession, resolvedVideoId, video?.muxPlaybackId]);

  useEffect(() => {
    if (!resolvedVideoId || !video || video.status === "uploading" || video.status === "failed") {
      setOriginalPlaybackUrl(null);
      setIsLoadingOriginalPlayback(false);
      return;
    }

    let cancelled = false;
    setIsLoadingOriginalPlayback(true);

    void getOriginalPlaybackUrl({ videoId: resolvedVideoId })
      .then((result) => {
        if (cancelled) return;
        setOriginalPlaybackUrl(result.url);
      })
      .catch(() => {
        if (cancelled) return;
        setOriginalPlaybackUrl(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingOriginalPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getOriginalPlaybackUrl, resolvedVideoId, video?.status, video?.s3Key]);

  useEffect(() => {
    if (!playbackUrl || activePlaybackUrl !== playbackUrl) return;
    prefetchHlsRuntime(playbackUrl);
    prefetchPlaybackSource(playbackUrl);
  }, [activePlaybackUrl, playbackUrl]);

  useEffect(() => {
    if (
      !resolvedVideoId ||
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
      void refreshPlaybackSession({ preserveExisting: true });
    }, refreshDelay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [playbackSession, refreshPlaybackSession, resolvedVideoId]);

  const handlePlaybackAccessError = useCallback(() => {
    if (!resolvedVideoId || playbackSession?.accessMode !== "signed") {
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
    void refreshPlaybackSession({ preserveExisting: true });
  }, [playbackSession?.accessMode, refreshPlaybackSession, resolvedVideoId]);

  const { trackTime: trackWatchTime } = useWatchProgress({
    enabled: Boolean(activePlaybackUrl && resolvedVideoId && !watchCapKind),
    trackerKey: resolvedVideoId?.toString() ?? null,
    getTarget: () => ({ videoId: resolvedVideoId! }),
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
      trackWatchTime(time);
    },
    [trackWatchTime],
  );

  const handleMarkerClick = useCallback((comment: { _id: string }) => {
    setHighlightedCommentId(comment._id as Id<"comments">);
    setTimeout(() => setHighlightedCommentId(undefined), 3000);
  }, []);

  const requestDownload = useCallback(async () => {
    if (!video || video.status !== "ready" || !resolvedVideoId) return null;
    try {
      const result = await getDownloadUrl({ videoId: resolvedVideoId });
      return result;
    } catch (error) {
      console.error("Failed to prepare download:", error);
      return null;
    }
  }, [getDownloadUrl, video, resolvedVideoId]);

  const reactionSummary = useMemo(
    () => summarizeReactions(reactions),
    [reactions],
  );

  const handleAddReaction = useCallback(
    async (emoji: "👍" | "❤️" | "😂" | "🎉" | "😮" | "🔥") => {
      if (!resolvedVideoId) return;
      try {
        await createReaction({
          videoId: resolvedVideoId,
          emoji,
          timestampSeconds: currentTime,
        });
      } catch (error) {
        console.error("Failed to add reaction:", error);
      }
    },
    [createReaction, currentTime, resolvedVideoId],
  );

  const handleTimestampClick = useCallback(
    (time: number) => {
      playerRef.current?.seekTo(time);
      setHighlightedCommentId(undefined);
    },
    [playerRef, setHighlightedCommentId]
  );

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !video || !resolvedVideoId) return;
    try {
      await updateVideo({ videoId: resolvedVideoId, title: editedTitle.trim() });
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  const startEditingTitle = () => {
    if (video) {
      setEditedTitle(video.title);
      setIsEditingTitle(true);
    }
  };

  if (context === undefined || video === undefined || shouldCanonicalize) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--foreground-muted)]">Loading...</div>
      </div>
    );
  }

  if (context === null || video === null || !resolvedProjectId || !resolvedVideoId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--foreground-muted)]">Video not found</div>
      </div>
    );
  }

  const canEdit = video.role !== "viewer";
  const canComment = true;
  const playerFallback = (
    <div className="flex-1 flex items-center justify-center">
      {video.status === "ready" && !playbackUrl ? (
        <div className="flex flex-col items-center gap-3 text-[var(--media-text)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--media-outline)] border-t-[var(--media-text-subtle)]" />
          <p className="text-sm font-medium text-[var(--media-text-dim)]">
            {isLoadingPlayback ? "Loading stream..." : "Preparing stream..."}
          </p>
        </div>
      ) : activePlaybackUrl ? (
        <div className="flex flex-col items-center gap-3 text-[var(--media-text)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--media-outline)] border-t-[var(--media-text-subtle)]" />
          <p className="text-sm font-medium text-[var(--media-text-dim)]">Loading player...</p>
        </div>
      ) : (
        <div className="text-center">
          {video.status === "uploading" && (
            <p className="text-[var(--media-text-faint)]">Uploading...</p>
          )}
          {video.status === "processing" && (
            <p className="text-[var(--media-text-faint)]">
              {isLoadingOriginalPlayback
                ? "Preparing original playback..."
                : "Processing video..."}
            </p>
          )}
          {video.status === "failed" && (
            <p className="text-[var(--destructive)]">Processing failed</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[
        {
          label: resolvedTeamSlug,
          href: teamHomePath(resolvedTeamSlug),
          prewarmIntentHandlers: prewarmTeamIntentHandlers,
        },
        {
          label: context?.project?.name ?? "project",
          href: projectPath(resolvedTeamSlug, resolvedProjectId),
          prewarmIntentHandlers: prewarmProjectIntentHandlers,
        },
        { 
          label: isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-40 sm:w-64 h-8 text-base font-black tracking-tighter uppercase font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsEditingTitle(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate max-w-[150px] sm:max-w-[300px]">{video.title}</span>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={startEditingTitle}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
              {video.status !== "ready" && (
                <Badge
                  variant={video.status === "failed" ? "destructive" : "secondary"}
                >
                  {video.status === "uploading" && "Uploading"}
                  {video.status === "processing" && "Processing"}
                  {video.status === "failed" && "Failed"}
                </Badge>
              )}
            </div>
          )
        }
      ]}>
        {/* Desktop: inline actions */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
          <span className="truncate max-w-[100px]">{video.uploaderName}</span>
          {video.duration && (
            <>
              <span className="text-[var(--foreground-muted)]">·</span>
              <span className="font-mono">{formatDuration(video.duration)}</span>
            </>
          )}
          <VideoWatchers watchers={watchers} />
        </div>
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0 border-l-2 border-[var(--border)]/20 pl-3 ml-1">
          <Button variant="outline" onClick={() => setShareDialogOpen(true)}>
            <LinkIcon className="mr-1.5 h-4 w-4" />
            Share
          </Button>
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setMobileCommentsOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
            {comments && comments.length > 0 && (
              <span className="ml-1 text-xs">{comments.length}</span>
            )}
          </Button>
        </div>

        {/* Mobile: compact actions */}
        <div className="flex sm:hidden items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setShareDialogOpen(true)}>
              <LinkIcon className="mr-2 h-4 w-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMobileCommentsOpen(true)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DashboardHeader>

      {/* Main content - horizontal split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video player area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--media-background)]">
          {video.status === "processing" && isUsingOriginalFallback && activePlaybackUrl ? (
            <div className="flex-shrink-0 flex items-center gap-2 bg-[var(--surface-strong)] px-4 py-2 text-sm text-[var(--media-text)]">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" />
              <span className="font-semibold">Original playback active.</span>
              <span className="text-[var(--media-text-faint)]">720p stream is still encoding.</span>
            </div>
          ) : null}

          {watchCapKind ? (
            <WatchCapNotice usageKind={watchCapKind} controlsBelow />
          ) : activePlaybackUrl ? (
            <Suspense fallback={playerFallback}>
              <LazyVideoPlayer
                ref={playerRef}
                src={activePlaybackUrl}
                poster={playbackSession?.posterUrl}
                comments={comments || []}
                onTimeUpdate={handleTimeUpdate}
                onMarkerClick={handleMarkerClick}
                onPlaybackAccessError={handlePlaybackAccessError}
                allowDownload={video.status === "ready"}
                downloadFilename={`${video.title}.mp4`}
                onRequestDownload={requestDownload}
                controlsBelow
                qualityOptionsConfig={[
                  {
                    id: "mux720",
                    label: playbackUrl ? "720p" : "720p (encoding...)",
                    disabled: !playbackUrl,
                  },
                  {
                    id: "original",
                    label: "Original",
                    disabled: !originalPlaybackUrl,
                  },
                ]}
                selectedQualityId={activeQualityId}
                onSelectQuality={(id) => {
                  if (id === "mux720" || id === "original") {
                    setPreferredSource(id);
                  }
                }}
              />
            </Suspense>
          ) : (
            playerFallback
          )}
        </div>

        {/* Comments sidebar — desktop */}
        <aside className="hidden lg:flex w-80 xl:w-96 border-l-2 border-[var(--border)] flex-col bg-[var(--background)]">
          <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[var(--foreground)] dark:text-[var(--foreground-inverse)]">
              Discussion
            </h2>
            {comments && comments.length > 0 && (
              <span className="text-[11px] font-medium text-[var(--foreground-muted)] bg-[var(--surface-strong)]/5 dark:bg-[var(--media-fill)] px-2 py-0.5 rounded-full">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </span>
            )}
          </div>
          <div className="flex-shrink-0 px-5 py-3 border-b border-[var(--border)]/10">
            <ReactionBar
              counts={reactionSummary}
              onReact={handleAddReaction}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <CommentList
              videoId={resolvedVideoId}
              comments={commentsThreaded}
              onTimestampClick={handleTimestampClick}
              highlightedCommentId={highlightedCommentId}
              canResolve={canEdit}
            />
          </div>
          {canComment && (
            <div className="flex-shrink-0 border-t-2 border-[var(--border)] bg-[var(--background)]">
              <CommentInput
                videoId={resolvedVideoId}
                timestampSeconds={currentTime}
                showTimestamp
                variant="seamless"
              />
            </div>
          )}
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
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <CommentList
              videoId={resolvedVideoId}
              comments={commentsThreaded}
              onTimestampClick={(time) => {
                handleTimestampClick(time);
                setMobileCommentsOpen(false);
              }}
              highlightedCommentId={highlightedCommentId}
              canResolve={canEdit}
            />
          </div>
          {canComment && (
            <div className="flex-shrink-0 border-t-2 border-[var(--border)] bg-[var(--background)]">
              <CommentInput
                videoId={resolvedVideoId}
                timestampSeconds={currentTime}
                showTimestamp
                variant="seamless"
              />
            </div>
          )}
        </div>
      )}

      <ShareDialog
        videoId={resolvedVideoId}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}
