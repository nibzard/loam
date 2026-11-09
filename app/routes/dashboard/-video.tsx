import { useAuth } from "@clerk/tanstack-react-start";
import { useConvex, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LazyVideoPlayer, preloadVideoPlayer, type VideoPlayerHandle } from "@/components/video-player/lazy";
import { VideoEditorLayout } from "@/components/video-player/VideoEditorLayout";
import { WatchCapNotice } from "@/components/video-player/WatchCapNotice";
import { CommentList } from "@/components/comments/CommentList";
import { CommentInput } from "@/components/comments/CommentInput";
import { ShareDialog } from "@/components/ShareDialog";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { buildCommentsCsv, buildCommentsCsvFilename } from "@/lib/commentCsv";
import { triggerTextDownload } from "@/lib/download";
import { useVideoPresence } from "@/lib/useVideoPresence";
import { VideoWatchers } from "@/components/presence/VideoWatchers";
import { DashboardHeader } from "@/components/DashboardHeader";
import {
  CollapsibleSidebar,
  resolveToggleLabel,
  useSidebarOpen,
} from "@/components/ui/CollapsibleSidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle,
  Edit2,
  Check,
  X,
  Layers3,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  MoreVertical,
  Download,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
  Upload,
} from "lucide-react";
import { ReactionBar, summarizeReactions } from "@/components/reactions/ReactionBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "@convex/_generated/dataModel";
import { projectPath, teamHomePath, videoPath } from "@/lib/routes";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prefetchHlsRuntime, prefetchPlaybackSource } from "@/lib/muxPlayback";
import {
  selectDashboardPlaybackUrl,
  type DashboardPlaybackSource,
} from "@/lib/dashboardPlaybackSource";
import { useDashboardUploadContext } from "@/lib/dashboardUploadContext";
import {
  PLAYBACK_SESSION_ACCESS_ERROR_COOLDOWN_MS,
  playbackSessionRefreshDelayMs,
  playbackSessionRetryDelayMs,
  playbackSessionRetryExhausted,
  type PlaybackSession,
} from "@/lib/playbackSession";
import { useWatchProgress } from "@/lib/useWatchProgress";
import { findPreferredReplacementVideoId } from "@/lib/videoVersionDeletion";
import { prewarmProject } from "./-project.data";
import { prewarmTeam } from "./-team.data";
import { prewarmVideo, useVideoData, type VideoVersionItem } from "./-video.data";
import {
  useVideoUploadManager,
  type ManagedUploadItem,
} from "./-useVideoUploadManager";

const DISCUSSION_SIDEBAR_ID = "video-discussion-sidebar";
const DISCUSSION_SIDEBAR_LABEL = "discussion sidebar";

const VIDEO_FILE_EXTENSIONS = /\.(mp4|mov|m4v|webm|mkv)$/i;

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || VIDEO_FILE_EXTENSIONS.test(file.name);
}

function dragEventHasFiles(event: ReactDragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function versionStatusLabel(status: string) {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

type VideoWorkflowStatus = "review" | "rework" | "done";

// Mirrors VIDEO_WORKFLOW_STATUS_OPTIONS on the project page (not imported so
// the two route views stay decoupled). Keep the values, labels, and swatches
// in sync: the badge must read the same on both surfaces.
const VIDEO_WORKFLOW_STATUS_OPTIONS: ReadonlyArray<{
  value: VideoWorkflowStatus;
  label: string;
  swatch: string;
}> = [
  { value: "review", label: "Review", swatch: "bg-[var(--foreground-muted)]" },
  { value: "rework", label: "Rework", swatch: "bg-[var(--warning)]" },
  { value: "done", label: "Done", swatch: "bg-[var(--accent)]" },
];

/**
 * Small workflow-status badge (Workstream 4): a square swatch plus a
 * monospace label, so a status set from the project page's bulk bar is
 * visible here too. Markup must stay identical to the project page's badge.
 */
function WorkflowStatusBadge({ status }: { status: VideoWorkflowStatus }) {
  const option = VIDEO_WORKFLOW_STATUS_OPTIONS.find(
    (item) => item.value === status,
  );
  if (!option) return null;
  return (
    <span
      title={`Status: ${option.label}`}
      className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-[var(--foreground-muted)]"
    >
      <span
        className={cn("h-2 w-2 shrink-0", option.swatch)}
        aria-hidden="true"
      />
      {option.label}
    </span>
  );
}

/** After a selector row collapses, move focus to the nearest surviving row. */
function focusNearestSurvivingVersion(deleteItem: HTMLElement) {
  const deletingRow = deleteItem.closest<HTMLElement>("[data-version-row]");
  const rowContainer = deletingRow?.parentElement;
  if (!deletingRow || !rowContainer) return;

  const versionRows = Array.from(rowContainer.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.versionRow !== undefined,
  );
  const deletingIndex = versionRows.indexOf(deletingRow);
  if (deletingIndex === -1) return;

  const nearestRow = versionRows[deletingIndex + 1] ?? versionRows[deletingIndex - 1];
  nearestRow?.querySelector<HTMLElement>("[data-version-radio-item]")?.focus();
}

function VersionSelectorOption({
  version,
  teamSlug,
  currentVideoId,
  onSelect,
  canDelete,
  deletingVideoId,
  onDelete,
}: {
  version: VideoVersionItem;
  teamSlug: string;
  currentVideoId: Id<"videos">;
  onSelect: (videoId: Id<"videos">) => void;
  canDelete: boolean;
  deletingVideoId: Id<"videos"> | null;
  onDelete: (version: VideoVersionItem, beforeDelete: () => void) => void;
}) {
  const convex = useConvex();
  const isDeleting = deletingVideoId === version._id;
  const deletionPending = deletingVideoId !== null;
  const selectionDisabled = isDeleting || deletingVideoId === currentVideoId;
  const prewarmIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmVideo(convex, {
      teamSlug,
      projectId: version.projectId,
      videoId: version._id,
    }),
  );

  return (
    <div
      role="presentation"
      data-version-row
      className={cn(
        "grid max-h-12 grid-cols-[minmax(0,1fr)_auto] overflow-hidden opacity-100 transition-[max-height,opacity,transform] duration-[180ms] motion-reduce:transition-none",
        isDeleting && "max-h-0 -translate-x-4 opacity-0",
      )}
    >
      <DropdownMenuRadioItem
        value={version._id}
        disabled={selectionDisabled}
        data-version-radio-item
        className="min-w-0"
        onSelect={() => onSelect(version._id)}
        {...prewarmIntentHandlers}
      >
        <span className="font-mono font-bold">v{version.versionNumber}</span>
        <span className="ml-2 truncate text-xs text-[var(--foreground-muted)]">
          {version._id === currentVideoId
            ? `${version.isLatestVersion ? "Viewing latest" : "Viewing"} · ${versionStatusLabel(version.status)}`
            : version.isLatestVersion
              ? `Latest · ${versionStatusLabel(version.status)}`
              : versionStatusLabel(version.status)}
        </span>
      </DropdownMenuRadioItem>
      {canDelete && (
        <DropdownMenuItem
          disabled={deletionPending}
          aria-label={`Delete version v${version.versionNumber}`}
          className="h-10 w-10 justify-center p-0 text-[var(--destructive)] focus:text-[var(--destructive)]"
          onSelect={(event) => {
            event.preventDefault();
            const deleteItem = event.currentTarget;
            onDelete(version, () => {
              if (deleteItem instanceof HTMLElement) {
                focusNearestSurvivingVersion(deleteItem);
              }
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Delete version v{version.versionNumber}</span>
        </DropdownMenuItem>
      )}
    </div>
  );
}

function VersionSelector({
  versions,
  currentVideoId,
  currentVersionNumber,
  teamSlug,
  onSelect,
  canDelete,
  deletingVideoId,
  onDelete,
  compact = false,
}: {
  versions: VideoVersionItem[] | undefined;
  currentVideoId: Id<"videos">;
  currentVersionNumber: number;
  teamSlug: string;
  onSelect: (videoId: Id<"videos">) => void;
  canDelete: boolean;
  deletingVideoId: Id<"videos"> | null;
  onDelete: (version: VideoVersionItem, beforeDelete: () => void) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lastSettledVersionsRef = useRef(versions);
  useEffect(() => {
    if (!deletingVideoId) {
      lastSettledVersionsRef.current = versions;
    }
  }, [deletingVideoId, versions]);
  // While a deletion is in flight the server already renumbered rows; keep
  // showing the list the user acted on so the deleting row animates out
  // instead of the whole menu reshuffling mid-click.
  const displayedVersions = deletingVideoId ? lastSettledVersionsRef.current : versions;
  const deletingVersionNumber = displayedVersions?.find(
    (version) => version._id === deletingVideoId,
  )?.versionNumber;
  const deletionPending = deletingVideoId !== null;
  const triggerLabel = deletionPending
    ? deletingVersionNumber
      ? `Deleting version v${deletingVersionNumber}`
      : "Deleting video version"
    : `Select video version, currently v${currentVersionNumber}`;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "icon" : "sm"}
            className={compact ? "h-8 w-8" : "font-mono"}
            aria-label={triggerLabel}
            aria-busy={deletionPending}
          >
            {deletionPending || displayedVersions === undefined ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Layers3 className="h-4 w-4" aria-hidden="true" />
            )}
            {!compact && <span>v{currentVersionNumber}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56" aria-busy={deletionPending}>
          <DropdownMenuLabel>Video versions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {displayedVersions === undefined ? (
            <DropdownMenuItem disabled>Loading versions...</DropdownMenuItem>
          ) : displayedVersions.length === 0 ? (
            <DropdownMenuItem disabled>No versions available</DropdownMenuItem>
          ) : (
            <DropdownMenuRadioGroup value={currentVideoId}>
              {displayedVersions.map((version) => (
                <VersionSelectorOption
                  key={version._id}
                  version={version}
                  teamSlug={teamSlug}
                  currentVideoId={currentVideoId}
                  onSelect={onSelect}
                  canDelete={canDelete}
                  deletingVideoId={deletingVideoId}
                  onDelete={onDelete}
                />
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {deletionPending && (
        <span className="sr-only" role="status" aria-live="polite">
          {triggerLabel}
        </span>
      )}
    </>
  );
}

/** File picker that styles like the header's outline controls. */
function NewVersionUploadButton({
  compact = false,
  onFileSelected,
}: {
  compact?: boolean;
  onFileSelected: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            onFileSelected(files);
          }
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-8 w-8" : undefined}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {compact ? (
          <span className="sr-only">Upload new version</span>
        ) : (
          "New version"
        )}
      </Button>
    </>
  );
}

function VersionUploadNotice({
  upload,
  onCancel,
  onDismiss,
  onView,
}: {
  upload: ManagedUploadItem;
  onCancel: () => void;
  onDismiss: () => void;
  onView: (videoId: Id<"videos">) => void;
}) {
  const isTerminal = upload.status === "complete" || upload.status === "error";

  return (
    <div className="border-2 border-[var(--border)] bg-[var(--background)] p-4 shadow-[4px_4px_0px_0px_var(--shadow-color)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--foreground)]">
            {upload.file.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--foreground-muted)]">
            New version · {formatBytes(upload.file.size)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {upload.status === "complete" && (
            <CheckCircle className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          )}
          {upload.status === "error" && (
            <AlertCircle className="h-5 w-5 text-[var(--destructive)]" aria-hidden="true" />
          )}
          {isTerminal ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              onClick={onDismiss}
              aria-label="Dismiss new version upload"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              onClick={onCancel}
              aria-label="Cancel new version upload"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {upload.status === "uploading" && (
        <div className="mt-3 space-y-1.5">
          <Progress value={upload.progress} />
          <div className="flex justify-between font-mono text-xs text-[var(--foreground-muted)]">
            <span>
              {upload.bytesPerSecond ? `${formatBytes(upload.bytesPerSecond)}/s` : "—"}
            </span>
            <span>{upload.progress}%</span>
          </div>
        </div>
      )}

      {upload.status === "complete" && upload.videoId && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => onView(upload.videoId as Id<"videos">)}
        >
          View version
        </Button>
      )}

      {upload.status === "error" && upload.error && (
        <p className="mt-2 text-xs text-[var(--destructive)]">{upload.error}</p>
      )}
    </div>
  );
}

export default function VideoPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";
  const projectId = params.projectId as Id<"projects">;
  const videoId = params.videoId as Id<"videos">;
  const convex = useConvex();
  const { isLoaded: isAuthLoaded, userId } = useAuth();

  const {
    context,
    resolvedTeamSlug,
    resolvedProjectId,
    resolvedVideoId,
    video,
    versions,
    comments,
    commentsThreaded,
    reactions,
  } = useVideoData({
    teamSlug,
    projectId,
    videoId,
  });
  const updateVideo = useMutation(api.videos.update);
  const deleteVideo = useMutation(api.videos.remove);
  const getPlaybackSession = useAction(api.videoActions.getPlaybackSession);
  const getOriginalPlaybackUrl = useAction(api.videoActions.getOriginalPlaybackUrl);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);
  const recordWatch = useAction(api.watchEventActions.recordWatch);
  const createReaction = useMutation(api.reactions.create);
  // Version uploads run through a page-local manager instance: their progress
  // cards belong to this stack's page. Standalone uploads keep flowing through
  // the dashboard layout's manager and its toasts.
  const {
    uploads: versionUploads,
    uploadFilesAsNewVersion,
    cancelUpload: cancelVersionUpload,
    dismissUpload: dismissVersionUpload,
  } = useVideoUploadManager();
  const { requestUpload } = useDashboardUploadContext();

  const [currentTime, setCurrentTime] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [highlightedCommentId, setHighlightedCommentId] = useState<Id<"comments"> | undefined>();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<Id<"videos"> | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [versionDropActive, setVersionDropActive] = useState(false);
  const [pendingVersionFile, setPendingVersionFile] = useState<File | null>(null);
  const [discussionSidebarOpen, toggleDiscussionSidebar] = useSidebarOpen();
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);
  const [refreshFailure, setRefreshFailure] = useState<{
    count: number;
    attempt: number;
  } | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [originalPlaybackUrl, setOriginalPlaybackUrl] = useState<string | null>(null);
  const [isLoadingOriginalPlayback, setIsLoadingOriginalPlayback] = useState(false);
  const [preferredSource, setPreferredSource] = useState<DashboardPlaybackSource>("mux720");
  const [playbackSessionFailed, setPlaybackSessionFailed] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [watchCapKind, setWatchCapKind] = useState<"member" | "shared" | null>(null);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const deletePendingRef = useRef(false);
  const versionDragDepthRef = useRef(0);
  const playbackRefreshInFlightRef = useRef(false);
  const playbackSessionKeyRef = useRef(0);
  const lastPlaybackAccessErrorAtRef = useRef(0);
  const isPlayable = video?.status === "ready" && Boolean(video?.muxPlaybackId);
  const playbackUrl = playbackSession?.url ?? null;
  const activePlaybackUrl = selectDashboardPlaybackUrl({
    preferredSource,
    muxPlaybackReady: isPlayable,
    // A failed session request degrades to the original instead of waiting
    // forever; an in-flight request keeps the player on its loading state.
    muxUrl: playbackUrl ?? (playbackSessionFailed ? originalPlaybackUrl : null),
    originalUrl: originalPlaybackUrl,
  });
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
    sessionKey: `${isAuthLoaded ? "loaded" : "loading"}:${userId ?? "guest"}`,
  });

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  // Switching to another version of the stack (or another video) must not
  // carry player state across the boundary: a stale playhead would timestamp
  // the first comment on the new version, and a stale highlight would point
  // at a comment that may not exist there.
  useEffect(() => {
    setWatchCapKind(null);
    setCurrentTime(0);
    setHighlightedCommentId(undefined);
  }, [resolvedVideoId]);

  useEffect(() => {
    if (!video || video.status === "uploading" || video.status === "failed") return;
    preloadVideoPlayer();
  }, [video]);

  useEffect(() => {
    playbackRefreshInFlightRef.current = false;
    playbackSessionKeyRef.current += 1;
    lastPlaybackAccessErrorAtRef.current = 0;
    setPlaybackSessionFailed(false);
    setRefreshFailure(null);
  }, [resolvedVideoId, video?.muxPlaybackId]);

  const refreshPlaybackSession = useCallback(
    async (options?: { preserveExisting?: boolean }) => {
      if (!resolvedVideoId || playbackRefreshInFlightRef.current) {
        return;
      }

      const requestKey = playbackSessionKeyRef.current;
      playbackRefreshInFlightRef.current = true;
      setIsLoadingPlayback(true);
      setPlaybackSessionFailed(false);

      if (!options?.preserveExisting) {
        setPlaybackSession(null);
      }

      try {
        const session = await getPlaybackSession({ videoId: resolvedVideoId });
        if (requestKey !== playbackSessionKeyRef.current) {
          return;
        }

        setPlaybackSession(session);
        setRefreshFailure(null);
      } catch {
        if (requestKey !== playbackSessionKeyRef.current) {
          return;
        }

        setPlaybackSessionFailed(true);
        if (!options?.preserveExisting) {
          setPlaybackSession(null);
        } else {
          // The kept session may already be expired and the player reports an
          // access error only once per source, so schedule our own retry.
          setRefreshFailure((previous) => ({
            count: (previous?.count ?? 0) + 1,
            attempt: 0,
          }));
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
    if (!resolvedVideoId) {
      return;
    }

    const refreshDelay = playbackSessionRefreshDelayMs(
      playbackSession,
      Date.now(),
    );

    if (refreshDelay === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshPlaybackSession({ preserveExisting: true });
    }, refreshDelay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [playbackSession, refreshPlaybackSession, resolvedVideoId]);

  useEffect(() => {
    if (!refreshFailure) {
      return;
    }

    // Stop after bounded attempts instead of polling a permanently dead
    // video or session forever; the failure state stays visible as-is.
    if (playbackSessionRetryExhausted(refreshFailure.count)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      // Bump the attempt so a refresh skipped because another one is in
      // flight still schedules the next retry.
      setRefreshFailure((previous) =>
        previous ? { count: previous.count, attempt: previous.attempt + 1 } : previous,
      );
      void refreshPlaybackSession({ preserveExisting: true });
    }, playbackSessionRetryDelayMs(refreshFailure.count));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshFailure, refreshPlaybackSession]);

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
    (time: number, rate?: number) => {
      setCurrentTime(time);
      trackWatchTime(time, rate);
    },
    [trackWatchTime],
  );

  const handleMarkerClick = useCallback((comment: { _id: string }) => {
    setHighlightedCommentId(comment._id as Id<"comments">);
    setTimeout(() => setHighlightedCommentId(undefined), 3000);
  }, []);

  const toggleTheater = useCallback(() => {
    setTheaterOpen((current) => !current);
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

  const handleExportComments = useCallback(() => {
    if (!video || !commentsThreaded?.length) return;

    // The stack's name (head title) labels the file; a version marker keeps
    // exports of older versions distinguishable, since comments stay
    // per-version.
    const stackTitle =
      versions?.find((version) => version.isLatestVersion)?.title ?? video.title;
    triggerTextDownload(
      buildCommentsCsv(commentsThreaded),
      buildCommentsCsvFilename(
        video.isLatestVersion
          ? stackTitle
          : `${stackTitle} v${video.versionNumber}`,
      ),
    );
  }, [commentsThreaded, versions, video]);

  useEffect(() => {
    if (!deleteNotice || deleteNotice.tone !== "success") return;

    const timeout = window.setTimeout(() => setDeleteNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [deleteNotice]);

  const handleVersionSelected = useCallback(
    (selectedVideoId: Id<"videos">) => {
      if (!resolvedProjectId || selectedVideoId === resolvedVideoId) return;
      navigate({
        to: videoPath(resolvedTeamSlug, resolvedProjectId, selectedVideoId),
      });
    },
    [navigate, resolvedProjectId, resolvedTeamSlug, resolvedVideoId],
  );

  const handleNewVersionSelected = useCallback(
    (files: File[]) => {
      const file = files.find(isVideoFile);
      if (!file || !resolvedVideoId || !resolvedProjectId) return;
      void uploadFilesAsNewVersion(resolvedVideoId, resolvedProjectId, [file]);
    },
    [resolvedProjectId, resolvedVideoId, uploadFilesAsNewVersion],
  );

  const handleViewUploadedVersion = useCallback(
    (uploadedVideoId: Id<"videos">) => {
      if (!resolvedProjectId) return;
      prewarmVideo(convex, {
        teamSlug: resolvedTeamSlug,
        projectId: resolvedProjectId,
        videoId: uploadedVideoId,
      });
      navigate({
        to: videoPath(resolvedTeamSlug, resolvedProjectId, uploadedVideoId),
      });
    },
    [convex, navigate, resolvedProjectId, resolvedTeamSlug],
  );

  const handleDeleteVersion = useCallback(
    async (
      versionToDelete: VideoVersionItem,
      animateSelectorRow = true,
      beforeDelete?: () => void,
    ) => {
      if (deletePendingRef.current || !resolvedVideoId || !resolvedProjectId) return;
      const isCurrentVersion = versionToDelete._id === resolvedVideoId;
      const stackSize = versions?.length ?? 1;
      const deletedWithStackCopy =
        stackSize > 1
          ? "Comments on this version will be deleted."
          : "Its comments and share links will be deleted.";
      const versionChangeCopy =
        stackSize > 1
          ? versionToDelete.isLatestVersion
            ? " The previous version will become latest."
            : " Later versions will be renumbered."
          : "";
      const destinationCopy = isCurrentVersion
        ? animateSelectorRow
          ? " You will be taken to the nearest remaining version."
          : " You will return to the project."
        : "";
      if (
        !window.confirm(
          `Delete ${versionToDelete.isLatestVersion && stackSize > 1 ? "latest " : ""}version v${versionToDelete.versionNumber}? ${deletedWithStackCopy}${versionChangeCopy}${destinationCopy} This can't be undone.`,
        )
      ) {
        return;
      }

      beforeDelete?.();
      deletePendingRef.current = true;
      setDeletingVideoId(versionToDelete._id);
      setDeleteNotice(null);

      try {
        // Non-current deletions keep the page mounted, so their request can
        // run while the selector row animates out. Deleting the current
        // version must navigate before the row disappears or the route races
        // the deletion (upstream 9a2c070).
        const requestDelete = () =>
          deleteVideo({ videoId: versionToDelete._id }).then(
            (result) => ({ ok: true as const, result }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        const nonCurrentDeleteRequest = isCurrentVersion ? null : requestDelete();

        if (animateSelectorRow) {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!reduceMotion) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
          }
        }

        const preferredReplacementVideoId =
          isCurrentVersion && animateSelectorRow
            ? findPreferredReplacementVideoId(versions, versionToDelete._id)
            : null;

        if (isCurrentVersion) {
          if (preferredReplacementVideoId) {
            prewarmVideo(convex, {
              teamSlug: resolvedTeamSlug,
              projectId: resolvedProjectId,
              videoId: preferredReplacementVideoId,
            });
            await navigate({
              to: videoPath(resolvedTeamSlug, resolvedProjectId, preferredReplacementVideoId),
              replace: true,
            });
          } else {
            await navigate({
              to: projectPath(resolvedTeamSlug, resolvedProjectId),
              replace: true,
            });
          }
        }

        const outcome = await (nonCurrentDeleteRequest ?? requestDelete());
        if (outcome.ok === false) {
          throw outcome.error;
        }

        const result = outcome.result;
        setDeleteNotice({
          tone: "success",
          message:
            stackSize > 1
              ? versionToDelete.isLatestVersion
                ? `Version v${versionToDelete.versionNumber} deleted. The previous version is now latest.`
                : `Version v${versionToDelete.versionNumber} deleted. Later versions were renumbered.`
              : "Video deleted. Returning to the project.",
        });

        if (
          isCurrentVersion &&
          result.replacementVideoId !== preferredReplacementVideoId
        ) {
          if (result.replacementVideoId) {
            prewarmVideo(convex, {
              teamSlug: resolvedTeamSlug,
              projectId: resolvedProjectId,
              videoId: result.replacementVideoId,
            });
            await navigate({
              to: videoPath(resolvedTeamSlug, resolvedProjectId, result.replacementVideoId),
              replace: true,
            });
          } else {
            await navigate({
              to: projectPath(resolvedTeamSlug, resolvedProjectId),
              replace: true,
            });
          }
        }
      } catch (error) {
        console.error("Failed to delete video version:", error);
        if (isCurrentVersion) {
          // The page may already have navigated away; an alert survives that.
          window.alert("Couldn't delete that video version. Please try again.");
        } else {
          setDeleteNotice({
            tone: "error",
            message: "Couldn't delete that video version. Please try again.",
          });
        }
      } finally {
        deletePendingRef.current = false;
        setDeletingVideoId(null);
      }
    },
    [convex, deleteVideo, navigate, resolvedProjectId, resolvedTeamSlug, resolvedVideoId, versions],
  );

  const discussionSidebarToggleLabel = resolveToggleLabel({
    isOpen: discussionSidebarOpen,
    label: DISCUSSION_SIDEBAR_LABEL,
  });

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !video || !resolvedVideoId) return;
    // The stack's title lives on the head row; an edit always writes there so
    // the heads-only project listing shows the change.
    const stackHeadVideoId =
      versions?.find((version) => version.isLatestVersion)?._id ?? resolvedVideoId;
    try {
      await updateVideo({ videoId: stackHeadVideoId, title: editedTitle.trim() });
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  const startEditingTitle = () => {
    if (video) {
      setEditedTitle(
        versions?.find((version) => version.isLatestVersion)?.title ?? video.title,
      );
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
  const canManageSharing =
    Boolean(userId) &&
    (video.uploadedByClerkId === userId ||
      video.role === "admin" ||
      video.role === "owner");
  // `videos.remove` requires an admin team role; the per-row delete buttons
  // in the version selector use the same gate.
  const canDeleteVersions = video.role === "admin" || video.role === "owner";
  const canComment = true;
  const showVersionSelector = (versions?.length ?? 0) > 1;
  // Stack-level metadata comes from the head; version-level details (status,
  // uploader, duration, discussion) stay per-version.
  const stackTitle =
    versions?.find((version) => version.isLatestVersion)?.title ?? video.title;
  const nextVersionNumber = versions?.[0] ? versions[0].versionNumber + 1 : null;

  // Dropping a file on the video page offers to cut it as the next version.
  // The handlers stop propagation so the dashboard layout's global drop
  // handler does not also treat it as a standalone project upload.
  const handleVersionDragEnter = (event: ReactDragEvent) => {
    if (!canManageSharing || !dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    versionDragDepthRef.current += 1;
    setVersionDropActive(true);
  };

  const handleVersionDragOver = (event: ReactDragEvent) => {
    if (!canManageSharing || !dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setVersionDropActive(true);
  };

  const handleVersionDragLeave = (event: ReactDragEvent) => {
    if (!canManageSharing || !dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    versionDragDepthRef.current = Math.max(0, versionDragDepthRef.current - 1);
    if (versionDragDepthRef.current === 0) {
      setVersionDropActive(false);
    }
  };

  const handleVersionDrop = (event: ReactDragEvent) => {
    if (!canManageSharing || !dragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    versionDragDepthRef.current = 0;
    setVersionDropActive(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    const videoFiles = files.filter(isVideoFile);
    if (files.length !== 1 || videoFiles.length !== 1) {
      window.alert("Drop one video at a time to upload it as a new version.");
      return;
    }
    setPendingVersionFile(videoFiles[0]);
  };

  const confirmPendingVersionUpload = () => {
    if (!pendingVersionFile || !resolvedVideoId || !resolvedProjectId) return;
    const file = pendingVersionFile;
    setPendingVersionFile(null);
    void uploadFilesAsNewVersion(resolvedVideoId, resolvedProjectId, [file]);
  };

  const uploadPendingFileAsSeparateVideo = () => {
    if (!pendingVersionFile || !resolvedProjectId) return;
    const file = pendingVersionFile;
    setPendingVersionFile(null);
    requestUpload([file], resolvedProjectId);
  };
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
    <VideoEditorLayout open={theaterOpen} onToggle={toggleTheater}>
      {/* `display: contents` keeps the editor layout's flex children intact
          while scoping the version-drop handlers to the video page. */}
      <div
        className="contents"
        onDragEnter={handleVersionDragEnter}
        onDragOver={handleVersionDragOver}
        onDragLeave={handleVersionDragLeave}
        onDrop={handleVersionDrop}
      >
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
              <span className="truncate max-w-[150px] sm:max-w-[300px]">{stackTitle}</span>
              {showVersionSelector && !video.isLatestVersion && (
                <span className="font-mono text-xs text-[var(--foreground-muted)]">
                  v{video.versionNumber}
                </span>
              )}
              <WorkflowStatusBadge status={video.workflowStatus} />
              {canEdit && video.isLatestVersion && (
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
          {showVersionSelector && (
            <VersionSelector
              versions={versions}
              currentVideoId={resolvedVideoId}
              currentVersionNumber={video.versionNumber}
              teamSlug={resolvedTeamSlug}
              onSelect={handleVersionSelected}
              canDelete={canDeleteVersions}
              deletingVideoId={deletingVideoId}
              onDelete={(versionToDelete, beforeDelete) =>
                void handleDeleteVersion(versionToDelete, true, beforeDelete)
              }
            />
          )}
          {canManageSharing && (
            <NewVersionUploadButton
              onFileSelected={handleNewVersionSelected}
            />
          )}
              {canManageSharing ? (
                <Button variant="outline" size="sm" onClick={() => setShareDialogOpen(true)}>
                  <LinkIcon className="mr-1.5 h-4 w-4" />
                  Share
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobileCommentsOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
            {comments && comments.length > 0 && (
              <span className="ml-1 text-xs">{comments.length}</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden lg:inline-flex h-8 w-8"
            onClick={toggleDiscussionSidebar}
            aria-label={discussionSidebarToggleLabel}
            aria-controls={DISCUSSION_SIDEBAR_ID}
            aria-expanded={discussionSidebarOpen}
          >
            {discussionSidebarOpen ? (
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Mobile: compact actions */}
        <div className="flex sm:hidden items-center gap-2">
          {showVersionSelector && (
            <VersionSelector
              versions={versions}
              currentVideoId={resolvedVideoId}
              currentVersionNumber={video.versionNumber}
              teamSlug={resolvedTeamSlug}
              onSelect={handleVersionSelected}
              canDelete={canDeleteVersions}
              deletingVideoId={deletingVideoId}
              onDelete={(versionToDelete, beforeDelete) =>
                void handleDeleteVersion(versionToDelete, true, beforeDelete)
              }
              compact
            />
          )}
          {canManageSharing && (
            <NewVersionUploadButton
              compact
              onFileSelected={handleNewVersionSelected}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManageSharing ? (
              <DropdownMenuItem onSelect={() => setShareDialogOpen(true)}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setMobileCommentsOpen(true)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}
            </DropdownMenuItem>
            {canDeleteVersions && !showVersionSelector && (
              <DropdownMenuItem
                className="text-[var(--destructive)] focus:text-[var(--destructive)]"
                disabled={deletingVideoId !== null}
                onSelect={() =>
                  void handleDeleteVersion(
                    {
                      _id: resolvedVideoId,
                      projectId: resolvedProjectId,
                      title: video.title,
                      status: video.status,
                      thumbnailUrl: video.thumbnailUrl,
                      versionNumber: video.versionNumber,
                      isLatestVersion: video.isLatestVersion,
                      createdAt: video._creationTime,
                    },
                    false,
                  )
                }
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete video (v{video.versionNumber})
              </DropdownMenuItem>
            )}
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
                key={resolvedVideoId}
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
                editorControls
                theaterMode={theaterOpen}
                onToggleTheater={toggleTheater}
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

        {/* Comments sidebar — desktop. The built-in toggle is suppressed
            (toggle={() => null}); the discussion header button drives the
            persisted store directly. */}
        <CollapsibleSidebar
          open={discussionSidebarOpen}
          side="right"
          id={DISCUSSION_SIDEBAR_ID}
          label={DISCUSSION_SIDEBAR_LABEL}
          className="hidden lg:flex"
          toggle={() => null}
        >
          <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-[var(--foreground)] dark:text-[var(--foreground-inverse)]">
              Discussion
            </h2>
            <div className="flex items-center gap-2">
              {comments && comments.length > 0 && (
                <span className="text-[11px] font-medium text-[var(--foreground-muted)] bg-[var(--surface-strong)]/5 dark:bg-[var(--media-fill)] px-2 py-0.5 rounded-full">
                  {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={handleExportComments}
                disabled={!commentsThreaded?.length}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
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
        </CollapsibleSidebar>
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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[10px]"
                onClick={handleExportComments}
                disabled={!commentsThreaded?.length}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileCommentsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
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

      {versionDropActive && (
        <div className="pointer-events-none fixed inset-0 z-40">
          <div className="absolute inset-0 bg-[var(--border)]/20" />
          <div className="absolute inset-4 flex items-center justify-center border-4 border-dashed border-[var(--accent)] bg-[var(--accent)]/10">
            <p className="border-2 border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-bold text-[var(--foreground)]">
              Drop one video to upload it as a new version
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={pendingVersionFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingVersionFile(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload as a new version?</DialogTitle>
            <DialogDescription>
              {pendingVersionFile
                ? `${pendingVersionFile.name} · ${formatBytes(pendingVersionFile.size)}`
                : ""}
              {nextVersionNumber !== null
                ? ` becomes v${nextVersionNumber} of "${stackTitle}".`
                : ` becomes the next version of "${stackTitle}".`}{" "}
              Existing share links keep working. Comments stay on the version
              they were posted on.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={confirmPendingVersionUpload}>
              <Upload className="h-4 w-4" />
              {nextVersionNumber !== null
                ? `Upload as v${nextVersionNumber}`
                : "Upload as new version"}
            </Button>
            <Button variant="outline" onClick={uploadPendingFileAsSeparateVideo}>
              Upload as separate video
            </Button>
            <Button variant="ghost" onClick={() => setPendingVersionFile(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {versionUploads.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50 space-y-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm">
          {versionUploads.map((upload) => (
            <VersionUploadNotice
              key={upload.id}
              upload={upload}
              onCancel={() => cancelVersionUpload(upload.id)}
              onDismiss={() => dismissVersionUpload(upload.id)}
              onView={handleViewUploadedVersion}
            />
          ))}
        </div>
      )}

      {deleteNotice && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-3 border-2 px-3 py-2 text-sm font-bold shadow-[4px_4px_0px_0px_var(--shadow-color)]",
            deleteNotice.tone === "error"
              ? "border-[var(--destructive)] bg-[var(--background)] text-[var(--destructive)]"
              : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]",
          )}
          role={deleteNotice.tone === "error" ? "alert" : "status"}
          aria-live={deleteNotice.tone === "error" ? "assertive" : "polite"}
        >
          <span>{deleteNotice.message}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            onClick={() => setDeleteNotice(null)}
            aria-label="Dismiss notice"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      </div>
    </VideoEditorLayout>
  );
}
