
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { UploadButton } from "@/components/upload/UploadButton";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import { triggerDownload } from "@/lib/download";
import {
  Play,
  MoreVertical,
  Trash2,
  Link as LinkIcon,
  Grid3X3,
  LayoutList,
  Download,
  MessageSquare,
  Eye,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { teamHomePath, videoPath } from "@/lib/routes";
import { prefetchHlsRuntime, prefetchMuxPlaybackManifest } from "@/lib/muxPlayback";
import { preloadVideoPlayer } from "@/components/video-player/lazy";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { useProjectData } from "./-project.data";
import { prewarmTeam } from "./-team.data";
import { prewarmVideo } from "./-video.data";
import { useDashboardUploadContext } from "@/lib/dashboardUploadContext";
import { DashboardHeader } from "@/components/DashboardHeader";

type ViewMode = "grid" | "list";
type ShareToastState = {
  tone: "success" | "error";
  message: string;
};

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

type VideoIntentTargetProps = {
  className: string;
  teamSlug: string;
  projectId: Id<"projects">;
  videoId: Id<"videos">;
  muxPlaybackId?: string;
  onOpen: () => void;
  children: ReactNode;
};

function VideoIntentTarget({
  className,
  teamSlug,
  projectId,
  videoId,
  muxPlaybackId,
  onOpen,
  children,
}: VideoIntentTargetProps) {
  const convex = useConvex();
  const prewarmIntentHandlers = useRoutePrewarmIntent(() => {
    prewarmVideo(convex, {
      teamSlug,
      projectId,
      videoId,
    });
    preloadVideoPlayer();
    prefetchHlsRuntime();
    if (muxPlaybackId) {
      prefetchMuxPlaybackManifest(muxPlaybackId);
    }
  });

  return (
    <div
      className={className}
      onClick={onOpen}
      {...prewarmIntentHandlers}
    >
      {children}
    </div>
  );
}

export default function ProjectPage({
  teamSlug,
  projectId,
}: {
  teamSlug: string;
  projectId: Id<"projects">;
}) {
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const convex = useConvex();

  const { context, resolvedProjectId, resolvedTeamSlug, project, videos } =
    useProjectData({ teamSlug, projectId });
  const projectPresenceCounts = useQuery(
    api.videoPresence.listProjectOnlineCounts,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const { requestUpload } = useDashboardUploadContext();
  const deleteVideo = useMutation(api.videos.remove);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [shareToast, setShareToast] = useState<ShareToastState | null>(null);
  const shareToastTimeoutRef = useRef<number | null>(null);

  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;
  const prewarmTeamIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmTeam(convex, { teamSlug: resolvedTeamSlug }),
  );

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  useEffect(
    () => () => {
      if (shareToastTimeoutRef.current !== null) {
        window.clearTimeout(shareToastTimeoutRef.current);
      }
    },
    [],
  );

  const isLoadingData =
    context === undefined ||
    project === undefined ||
    videos === undefined ||
    shouldCanonicalize;

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!resolvedProjectId) return;
      requestUpload(files, resolvedProjectId);
    },
    [requestUpload, resolvedProjectId],
  );

  const handleDeleteVideo = async (videoId: Id<"videos">) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      await deleteVideo({ videoId });
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  const handleDownloadVideo = useCallback(
    async (videoId: Id<"videos">, title: string) => {
      try {
        const result = await getDownloadUrl({ videoId });
        if (result?.url) {
          triggerDownload(result.url, result.filename ?? `${title}.mp4`);
        }
      } catch (error) {
        console.error("Failed to download video:", error);
      }
    },
    [getDownloadUrl],
  );

  const showShareToast = useCallback((tone: ShareToastState["tone"], message: string) => {
    setShareToast({ tone, message });
    if (shareToastTimeoutRef.current !== null) {
      window.clearTimeout(shareToastTimeoutRef.current);
    }
    shareToastTimeoutRef.current = window.setTimeout(() => {
      setShareToast(null);
      shareToastTimeoutRef.current = null;
    }, 2400);
  }, []);

  const handleShareVideo = useCallback(
    async (video: {
      _id: Id<"videos">;
      publicId?: string;
      status: string;
      visibility: "public" | "private";
    }) => {
      const canSharePublicly =
        Boolean(video.publicId) &&
        video.status === "ready" &&
        video.visibility === "public";
      const path = canSharePublicly
        ? `/watch/${video.publicId}`
        : videoPath(resolvedTeamSlug, projectId, video._id);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}${path}`;

      try {
        const copied = await copyTextToClipboard(url);
        if (!copied) {
          showShareToast("error", "Could not copy link");
          return;
        }
        showShareToast(
          "success",
          canSharePublicly
            ? "Share link copied"
            : "Video link copied (public watch link not available yet)",
        );
      } catch {
        showShareToast("error", "Could not copy link");
      }
    },
    [projectId, resolvedTeamSlug, showShareToast],
  );

  // Not found state
  if (context === null || project === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--foreground-muted)]">Project not found</div>
      </div>
    );
  }

  const canUpload = project?.role !== "viewer";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[
        {
          label: resolvedTeamSlug,
          href: teamHomePath(resolvedTeamSlug),
          prewarmIntentHandlers: prewarmTeamIntentHandlers,
        },
        { label: project?.name ?? "\u00A0" }
      ]}>
        <div className={cn(
          "flex items-center gap-2 transition-opacity duration-300 flex-shrink-0",
          isLoadingData ? "opacity-0" : "opacity-100"
        )}>
          {/* View toggle */}
          <div className="flex items-center border-2 border-[var(--border)] p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-[var(--surface-strong)] text-[var(--foreground-inverse)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-[var(--surface-strong)] text-[var(--foreground-inverse)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
              )}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
          {canUpload && (
            <UploadButton onFilesSelected={handleFilesSelected} />
          )}
        </div>
      </DashboardHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!isLoadingData && videos.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 animate-in fade-in duration-300">
            <DropZone
              onFilesSelected={handleFilesSelected}
              disabled={!canUpload}
              className="max-w-xl w-full"
            />
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View - Responsive tiles */
          <div className={cn(
            "p-6 transition-opacity duration-300",
            isLoadingData ? "opacity-0" : "opacity-100"
          )}>
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {videos?.map((video) => {
                const thumbnailSrc = video.thumbnailUrl?.startsWith("http")
                  ? video.thumbnailUrl
                  : undefined;
                const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
                const watchingCount =
                  projectPresenceCounts?.counts?.[video._id] ?? 0;

                return (
                  <VideoIntentTarget
                    key={video._id}
                    className="group cursor-pointer flex flex-col"
                    teamSlug={resolvedTeamSlug}
                    projectId={project._id}
                    videoId={video._id}
                    muxPlaybackId={video.muxPlaybackId}
                    onOpen={() =>
                      navigate({
                        to: videoPath(resolvedTeamSlug, project._id, video._id),
                      })
                    }
                  >
                    <div className="relative aspect-video bg-[var(--surface-alt)] overflow-hidden border-2 border-[var(--border)] shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all">
                      {thumbnailSrc ? (
                        <img
                          src={thumbnailSrc}
                          alt={video.title}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="h-10 w-10 text-[var(--foreground-muted)]" />
                        </div>
                      )}
                    {video.status === "ready" && video.duration && (
                      <div className="absolute bottom-2 right-2 bg-[var(--media-overlay-strong)] text-[var(--media-text)] text-[11px] font-mono px-1.5 py-0.5">
                        {formatDuration(video.duration)}
                      </div>
                    )}
                    {video.status !== "ready" && (
                      <div className="absolute inset-0 bg-[var(--media-overlay)] flex items-center justify-center">
                        <span className="text-[var(--media-text)] text-xs font-bold uppercase tracking-wider">
                          {video.status === "uploading" && "Uploading..."}
                          {video.status === "processing" && "Processing..."}
                          {video.status === "failed" && "Failed"}
                        </span>
                      </div>
                    )}
                    {/* Hover menu */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center bg-[var(--media-overlay-strong)] hover:bg-[var(--media-overlay-solid)] text-[var(--media-text)]"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canDownload && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownloadVideo(
                                  video._id,
                                  video.title,
                                );
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleShareVideo(video);
                            }}
                          >
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Share
                          </DropdownMenuItem>
                          {canUpload && (
                            <DropdownMenuItem
                              className="text-[var(--destructive)] focus:text-[var(--destructive)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteVideo(video._id);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="text-[15px] text-[var(--foreground)] font-black truncate leading-tight">
                      {video.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      {video.commentCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--foreground-muted)]">
                          <MessageSquare className="h-3 w-3" />
                          {video.commentCount}
                        </span>
                      )}
                      {watchingCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--foreground)]">
                          <Eye className="h-3 w-3" />
                          {watchingCount}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--foreground-muted)] ml-auto font-mono">
                        {formatRelativeTime(video._creationTime)}
                      </span>
                    </div>
                  </div>
                  </VideoIntentTarget>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View - Horizontal rows */
          <div className={cn(
            "divide-y-2 divide-[var(--border)] transition-opacity duration-300",
            isLoadingData ? "opacity-0" : "opacity-100"
          )}>
            {videos?.map((video) => {
              const thumbnailSrc = video.thumbnailUrl?.startsWith("http")
                ? video.thumbnailUrl
                : undefined;
              const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
              const watchingCount =
                projectPresenceCounts?.counts?.[video._id] ?? 0;

              return (
                <VideoIntentTarget
                  key={video._id}
                  className="group flex items-center gap-5 px-6 py-3 hover:bg-[var(--surface-alt)] cursor-pointer transition-colors"
                  teamSlug={resolvedTeamSlug}
                  projectId={project._id}
                  videoId={video._id}
                  muxPlaybackId={video.muxPlaybackId}
                  onOpen={() =>
                    navigate({
                      to: videoPath(resolvedTeamSlug, project._id, video._id),
                    })
                  }
                >
                  {/* Thumbnail */}
                  <div className="relative w-44 aspect-video bg-[var(--surface-alt)] overflow-hidden border-2 border-[var(--border)] shrink-0 shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all">
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt={video.title}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-6 w-6 text-[var(--foreground-muted)]" />
                      </div>
                    )}
                    {video.status !== "ready" && (
                      <div className="absolute inset-0 bg-[var(--media-overlay)] flex items-center justify-center">
                        <span className="text-[var(--media-text)] text-[10px] font-bold uppercase tracking-wider">
                          {video.status === "uploading" && "Uploading..."}
                          {video.status === "processing" && "Processing..."}
                          {video.status === "failed" && "Failed"}
                        </span>
                      </div>
                    )}
                    {video.status === "ready" && video.duration && (
                      <div className="absolute bottom-1 right-1 bg-[var(--media-overlay-strong)] text-[var(--media-text)] text-[10px] font-mono px-1 py-0.5">
                        {formatDuration(video.duration)}
                      </div>
                    )}
                  </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-[var(--foreground)] truncate">
                    {video.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {video.commentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {video.commentCount}
                      </span>
                    )}
                    {watchingCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--foreground)]">
                        <Eye className="h-3.5 w-3.5" />
                        {watchingCount}
                      </span>
                    )}
                    <span className="text-xs text-[var(--foreground-muted)] font-mono">
                      {formatRelativeTime(video._creationTime)}
                    </span>
                    {video.uploaderName && (
                      <span className="text-xs text-[var(--foreground-muted)]">
                        {video.uploaderName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canDownload && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDownloadVideo(video._id, video.title);
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleShareVideo(video);
                        }}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      {canUpload && (
                        <DropdownMenuItem
                          className="text-[var(--destructive)] focus:text-[var(--destructive)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVideo(video._id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </VideoIntentTarget>
              );
            })}
          </div>
        )}
      </div>

      {shareToast ? (
        <div className="fixed right-4 top-4 z-50" aria-live="polite">
          <div
            className={cn(
              "border-2 px-3 py-2 text-sm font-bold shadow-[4px_4px_0px_0px_var(--shadow-color)]",
              shareToast.tone === "success"
                ? "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                : "border-[var(--destructive)] bg-[var(--destructive-subtle)] text-[var(--destructive)]",
            )}
          >
            {shareToast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
