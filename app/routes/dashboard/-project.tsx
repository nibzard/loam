
import { useAuth } from "@clerk/tanstack-react-start";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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
  Check,
  ChevronDown,
  FolderInput,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { teamHomePath, videoPath } from "@/lib/routes";
import { preloadVideoPlayer } from "@/components/video-player/lazy";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { useProjectData, useProjectVideoSort, type ProjectVideoSort } from "./-project.data";
import { prewarmTeam } from "./-team.data";
import { prewarmVideo } from "./-video.data";
import { useDashboardUploadContext } from "@/lib/dashboardUploadContext";
import { DashboardHeader } from "@/components/DashboardHeader";
import { prepareDefaultShareLink } from "@/lib/shareLinks";
import { useProjectVideoPosterUrls } from "@/lib/useProjectVideoPosterUrls";
import { runBulkVideoAction, useVideoSelection } from "@/lib/videoSelection";

type ViewMode = "grid" | "list";
type ShareToastState = {
  tone: "success" | "error";
  message: string;
};
const EAGER_POSTER_COUNT = 4;

type VideoIntentTargetProps = {
  className: string;
  teamSlug: string;
  projectId: Id<"projects">;
  videoId: Id<"videos">;
  onOpen: () => void;
  /** Shift-click selects instead of opening when provided. */
  onShiftSelect?: () => void;
  children: ReactNode;
};

function VideoIntentTarget({
  className,
  teamSlug,
  projectId,
  videoId,
  onOpen,
  onShiftSelect,
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
  });

  return (
    <div
      className={className}
      onClick={(event) =>
        event.shiftKey && onShiftSelect ? onShiftSelect() : onOpen()
      }
      onMouseDown={(event) => {
        // Keep shift-click range selection from also selecting page text.
        if (event.shiftKey && onShiftSelect) event.preventDefault();
      }}
      {...prewarmIntentHandlers}
    >
      {children}
    </div>
  );
}

const VIDEO_SORT_OPTIONS: ReadonlyArray<{
  value: ProjectVideoSort;
  label: string;
}> = [
  { value: "recent", label: "Recent" },
  { value: "title-asc", label: "A-Z" },
  { value: "title-desc", label: "Z-A" },
];

/**
 * Segmented control for the three video sort orders (upstream aaf96d8's sort
 * UI, 74dc0cc's roving-tabindex radiogroup, f7ff59a's group-level focus ring,
 * widened to three states per Workstream 4). Square corners, monospace labels,
 * and a selected segment that inverts like the adjacent view toggle. The
 * focus ring sits on the whole group, not the segment: a per-segment ring
 * would land on the group's own border and stay invisible in both themes.
 */
function VideoSortControl({
  value,
  onChange,
}: {
  value: ProjectVideoSort;
  onChange: (value: ProjectVideoSort) => void;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: ProjectVideoSort, focus = false) => {
    onChange(next);
    if (focus) {
      const index = VIDEO_SORT_OPTIONS.findIndex(
        (option) => option.value === next,
      );
      optionRefs.current[index]?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = VIDEO_SORT_OPTIONS.findIndex(
      (option) => option.value === value,
    );
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % VIDEO_SORT_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + VIDEO_SORT_OPTIONS.length) % VIDEO_SORT_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = VIDEO_SORT_OPTIONS.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    select(VIDEO_SORT_OPTIONS[nextIndex].value, true);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Sort videos"
      onKeyDown={handleKeyDown}
      className="flex flex-shrink-0 items-center border-2 border-[var(--border)] p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]"
    >
      {VIDEO_SORT_OPTIONS.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`Sort by ${option.label.toLowerCase()}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(option.value)}
            className={cn(
              "flex h-7 items-center justify-center px-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none",
              selected
                ? "bg-[var(--surface-strong)] text-[var(--foreground-inverse)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select (upstream 69b3cec + da236dc). Selection state lives in
// useVideoSelection; everything visual lives here.
// ---------------------------------------------------------------------------

export type VideoWorkflowStatus = "review" | "rework" | "done";

const VIDEO_WORKFLOW_STATUS_OPTIONS: ReadonlyArray<{
  value: VideoWorkflowStatus;
  label: string;
  swatch: string;
}> = [
  { value: "review", label: "Review", swatch: "bg-[var(--foreground-muted)]" },
  { value: "rework", label: "Rework", swatch: "bg-[var(--warning)]" },
  { value: "done", label: "Done", swatch: "bg-[var(--accent)]" },
];

/** The display option for a workflow status, or undefined when unknown. */
export function getWorkflowStatusOption(status: VideoWorkflowStatus) {
  return VIDEO_WORKFLOW_STATUS_OPTIONS.find(
    (option) => option.value === status,
  );
}

/**
 * Small workflow-status badge (Workstream 4): a square swatch plus a
 * monospace label, so a status set from the bulk bar is visible while
 * browsing. Rendered on project cards and in the video page header; the
 * markup must stay identical in both surfaces.
 */
function WorkflowStatusBadge({ status }: { status: VideoWorkflowStatus }) {
  const option = getWorkflowStatusOption(status);
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

/**
 * Hover checkbox over a video thumbnail (upstream 69b3cec, touch fix
 * da236dc). It sits on top of media, so the unchecked state uses the media
 * overlay treatment, not page tokens. Revealed on hover and focus, always
 * visible once a selection exists or on touch devices.
 */
function SelectionCheckbox({
  checked,
  visible,
  label,
  onToggle,
  className,
}: {
  checked: boolean;
  /** Always shown (selection mode); otherwise revealed on hover/focus. */
  visible: boolean;
  label: string;
  onToggle: (extendRange: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "z-30 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border-2 transition-opacity",
        checked
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-white bg-[var(--media-overlay)] text-transparent hover:bg-[var(--media-overlay-strong)]",
        visible || checked
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
        className,
      )}
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event.shiftKey);
      }}
    >
      <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

const SELECTION_BAR_ACTION_CLASS =
  "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground-inverse)] disabled:pointer-events-none disabled:opacity-40";

/**
 * Floating action bar for the current selection (upstream 69b3cec): move,
 * set workflow status, delete, and clear. Escape also clears (handled in
 * useVideoSelection). Actions the caller cannot use are omitted entirely.
 */
function VideoSelectionBar({
  count,
  onMove,
  onSetStatus,
  onDelete,
  onClear,
}: {
  count: number;
  onMove?: () => void;
  onSetStatus?: (status: VideoWorkflowStatus) => void;
  onDelete?: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected videos"
      className="fixed bottom-4 right-4 z-40 flex items-center border-2 border-[var(--border)] bg-[var(--background)] p-1 shadow-[4px_4px_0px_0px_var(--shadow-color)]"
    >
      <span
        className="px-3 font-mono text-sm font-bold text-[var(--foreground)] tabular-nums"
        aria-live="polite"
      >
        {count} selected
      </span>
      {onMove && (
        <button
          type="button"
          className={SELECTION_BAR_ACTION_CLASS}
          aria-label="Move selected videos"
          onClick={onMove}
        >
          <FolderInput className="h-4 w-4" />
          <span className="hidden sm:inline">Move</span>
        </button>
      )}
      {onSetStatus && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={SELECTION_BAR_ACTION_CLASS}>
              Status
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {VIDEO_WORKFLOW_STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                className="gap-2"
                onClick={() => onSetStatus(option.value)}
              >
                <span
                  className={cn("h-2 w-2 shrink-0", option.swatch)}
                  aria-hidden="true"
                />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onDelete && (
        <button
          type="button"
          className={cn(
            SELECTION_BAR_ACTION_CLASS,
            "text-[var(--destructive)] hover:bg-[var(--destructive)] hover:text-[var(--foreground-inverse)]",
          )}
          aria-label="Delete selected videos"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      )}
      <button
        type="button"
        className={cn(SELECTION_BAR_ACTION_CLASS, "w-9 justify-center px-0")}
        aria-label="Clear selection"
        title="Clear selection (Esc)"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Destination picker for a bulk move: the team's other projects. The query
 * runs only while the dialog is open.
 */
function MoveVideosDialog({
  teamId,
  currentProjectId,
  count,
  open,
  moving,
  onOpenChange,
  onMoveTo,
}: {
  teamId: Id<"teams"> | undefined;
  currentProjectId: Id<"projects"> | undefined;
  count: number;
  open: boolean;
  moving: boolean;
  onOpenChange: (open: boolean) => void;
  onMoveTo: (projectId: Id<"projects">) => void;
}) {
  const projects = useQuery(
    api.projects.list,
    teamId && open ? { teamId } : "skip",
  );
  const destinations = projects?.filter(
    (project) => project._id !== currentProjectId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {count === 1 ? "1 video" : `${count} videos`}
          </DialogTitle>
          <DialogDescription>
            Pick a destination project. Every version of each selected video
            moves with it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto border-2 border-[var(--border)] divide-y-2 divide-[var(--border)]">
          {projects === undefined ? (
            <div className="p-3 text-sm text-[var(--foreground-muted)]">
              Loading projects...
            </div>
          ) : destinations && destinations.length > 0 ? (
            destinations.map((project) => (
              <button
                key={project._id}
                type="button"
                disabled={moving}
                onClick={() => onMoveTo(project._id)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[var(--surface-alt)] px-4 py-3 text-left font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--surface)] disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="truncate">{project.name}</span>
                <span className="flex-shrink-0 font-mono text-xs font-normal text-[var(--foreground-muted)]">
                  {project.videoCount}
                  {project.videoCountIsCapped ? "+" : ""} videos
                </span>
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-[var(--foreground-muted)]">
              This is the only project in the team. Create another project
              before moving videos.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function isTitleOverflowing(
  container: Pick<HTMLElement, "clientWidth">,
  text: Pick<HTMLElement, "scrollWidth">,
) {
  return text.scrollWidth > container.clientWidth + 1;
}

/**
 * Truncated title that expands on click (upstream aaf96d8). An invisible
 * nowrap copy of the text measures the natural width; only when it is wider
 * than the container does the visible title become a toggle button, so titles
 * that already fit never grow a bogus expander.
 */
export function ExpandableTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const measurementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setExpanded(false), [title]);

  useLayoutEffect(() => {
    if (!containerRef.current || !measurementRef.current) return;
    const container = containerRef.current;
    const measurement = measurementRef.current;
    const measure = () =>
      setCanExpand(isTitleOverflowing(container, measurement));
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [title]);

  const titleClassName = cn(
    "block w-full max-w-full min-w-0 text-left",
    expanded ? "break-words whitespace-normal" : "truncate",
    className,
  );

  return (
    <span ref={containerRef} title={title} className={cn("relative", titleClassName)}>
      <span
        ref={measurementRef}
        className="pointer-events-none invisible absolute whitespace-nowrap"
        aria-hidden="true"
      >
        {title}
      </span>
      {canExpand || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          className={cn(
            "block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]",
            expanded ? "break-words whitespace-normal" : "truncate",
          )}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {title}
        </button>
      ) : (
        title
      )}
    </span>
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
  const { userId } = useAuth();

  const [videoSort, setVideoSort] = useProjectVideoSort();
  const { context, resolvedProjectId, resolvedTeamSlug, project, videos: videosPage } =
    useProjectData({ teamSlug, projectId, sort: videoSort });
  const videos = videosPage?.videos;
  const videosCapped = videosPage?.hasMore ?? false;
  const projectPresenceCounts = useQuery(
    api.videoPresence.listProjectOnlineCounts,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const { requestUpload } = useDashboardUploadContext();
  const deleteVideo = useMutation(api.videos.remove);
  const getDownloadUrl = useAction(api.videoActions.getDownloadUrl);
  const ensureDefaultShareLink = useMutation(api.shareLinks.ensureDefault);

  // Bulk mutations (upstream 69b3cec). Each chunk runs as its own
  // transaction, so the optimistic updates only touch the ids in that chunk.
  const removeManyVideos = useMutation(api.videos.removeMany).withOptimisticUpdate(
    (localStore, { videoIds }) => {
      const removed = new Set(videoIds);
      for (const { args, value } of localStore.getAllQueries(api.videos.list)) {
        if (!value || !value.videos.some((video) => removed.has(video._id))) continue;
        localStore.setQuery(api.videos.list, args, {
          ...value,
          videos: value.videos.filter((video) => !removed.has(video._id)),
        });
      }
    },
  );
  const moveManyVideos = useMutation(api.videos.moveMany).withOptimisticUpdate(
    (localStore, { videoIds, projectId }) => {
      const moved = new Set(videoIds);
      for (const { args, value } of localStore.getAllQueries(api.videos.list)) {
        // A move only removes videos from the source project's list; the
        // destination's list refreshes from the server.
        if (!value || args.projectId === projectId) continue;
        if (!value.videos.some((video) => moved.has(video._id))) continue;
        localStore.setQuery(api.videos.list, args, {
          ...value,
          videos: value.videos.filter((video) => !moved.has(video._id)),
        });
      }
    },
  );
  const setManyWorkflowStatus = useMutation(
    api.videos.updateWorkflowStatusMany,
  ).withOptimisticUpdate((localStore, { videoIds, workflowStatus }) => {
    const updated = new Set(videoIds);
    for (const { args, value } of localStore.getAllQueries(api.videos.list)) {
      if (!value || !value.videos.some((video) => updated.has(video._id))) continue;
      localStore.setQuery(api.videos.list, args, {
        ...value,
        videos: value.videos.map((video) =>
          updated.has(video._id) ? { ...video, workflowStatus } : video,
        ),
      });
    }
  });

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [shareToast, setShareToast] = useState<ShareToastState | null>(null);
  const shareToastTimeoutRef = useRef<number | null>(null);
  const videoPosterUrls = useProjectVideoPosterUrls({
    projectId: resolvedProjectId,
    videos,
  });

  // Multi-select (upstream 69b3cec). The scope covers project AND sort order:
  // shift-click range selection is only meaningful against a stable order.
  const orderedVideoIds = useMemo(
    () => videos?.map((video) => video._id) ?? [],
    [videos],
  );
  const selectionScope = useMemo(
    () => (resolvedProjectId ? `${resolvedProjectId}:${videoSort}` : null),
    [resolvedProjectId, videoSort],
  );
  const selection = useVideoSelection(orderedVideoIds, selectionScope);
  const selectedVideoIds = useMemo(
    () => [...selection.selectedIds],
    [selection.selectedIds],
  );

  const [bulkError, setBulkError] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);

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

  // Bulk actions run in server-sized chunks, one at a time (upstream
  // da236dc): a failure reports how many videos were already done, and the
  // remaining chunks stay untouched. Errors surface in the bulk error toast.
  const handleBulkMoveTo = async (destinationProjectId: Id<"projects">) => {
    if (selectedVideoIds.length === 0 || isBulkMoving) return;
    setIsBulkMoving(true);
    try {
      const result = await runBulkVideoAction(
        selectedVideoIds,
        (chunkIds) =>
          moveManyVideos({ videoIds: chunkIds, projectId: destinationProjectId }),
        "Failed to move videos",
      );
      if (result.ok) {
        setMoveDialogOpen(false);
        selection.clear();
        setBulkError(null);
      } else {
        setBulkError(result.error);
      }
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkStatus = async (workflowStatus: VideoWorkflowStatus) => {
    if (selectedVideoIds.length === 0) return;
    const result = await runBulkVideoAction(
      selectedVideoIds,
      (chunkIds) => setManyWorkflowStatus({ videoIds: chunkIds, workflowStatus }),
      "Failed to update status",
    );
    if (!result.ok) setBulkError(result.error);
  };

  const handleBulkDelete = async () => {
    const count = selectedVideoIds.length;
    if (count === 0) return;
    if (
      !confirm(
        `Delete ${count === 1 ? "1 video" : `${count} videos`} and all their versions? Comments and share links are deleted too. This cannot be undone.`,
      )
    ) {
      return;
    }
    const result = await runBulkVideoAction(
      selectedVideoIds,
      (chunkIds) => removeManyVideos({ videoIds: chunkIds }),
      "Failed to delete videos",
    );
    if (result.ok) {
      selection.clear();
      setBulkError(null);
    } else {
      setBulkError(result.error);
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
      status: string;
    }) => {
      try {
        const { copied } = await prepareDefaultShareLink({
          videoId: video._id,
          ensureDefaultShareLink,
        });
        if (!copied) {
          showShareToast("error", "Could not copy link");
          return;
        }
        showShareToast(
          "success",
          video.status === "ready"
            ? "Share link copied"
            : "Share link copied. It will work after processing finishes.",
        );
      } catch {
        showShareToast("error", "Could not prepare share link");
      }
    },
    [ensureDefaultShareLink, showShareToast],
  );

  // Not found state
  if (context === null || project === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--foreground-muted)]">Project not found</div>
      </div>
    );
  }

  const canEditProject = project?.role !== "viewer";
  // Bulk delete hits videos.removeMany, which requires admin per id (same as
  // the single-video delete); selection itself, move, and status need only
  // member access, so viewers get no selection UI at all.
  const canDeleteVideos = project?.role === "admin" || project?.role === "owner";
  const canSelectVideos = canEditProject;
  const selectionActive = canSelectVideos && selection.selectedIds.size > 0;

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
          {/* Sort control */}
          <VideoSortControl value={videoSort} onChange={setVideoSort} />
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
          {canEditProject && (
            <UploadButton onFilesSelected={handleFilesSelected} />
          )}
        </div>
      </DashboardHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {videosCapped ? (
          <p className="border-b border-[var(--border-subtle)] px-6 py-2 font-mono text-xs uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
            Showing the first 100 videos
          </p>
        ) : null}
        {!isLoadingData && videos.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 animate-in fade-in duration-300">
            <DropZone
              onFilesSelected={handleFilesSelected}
              disabled={!canEditProject}
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
              {videos?.map((video, index) => {
                const thumbnailSrc =
                  videoPosterUrls[video._id] ??
                  (video.thumbnailUrl?.startsWith("http") ? video.thumbnailUrl : undefined);
                const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
                const watchingCount =
                  projectPresenceCounts?.counts?.[video._id] ?? 0;
                const shouldPrioritizePoster = index < EAGER_POSTER_COUNT;
                const canManageSharing =
                  Boolean(userId) &&
                  (video.uploadedByClerkId === userId ||
                    project.role === "admin" ||
                    project.role === "owner");
                const isSelected = selection.selectedIds.has(video._id);

                return (
                  <VideoIntentTarget
                    key={video._id}
                    className="group cursor-pointer flex flex-col"
                    teamSlug={resolvedTeamSlug}
                    projectId={project._id}
                    videoId={video._id}
                    onOpen={() =>
                      navigate({
                        to: videoPath(resolvedTeamSlug, project._id, video._id),
                      })
                    }
                    onShiftSelect={
                      canSelectVideos
                        ? () => selection.toggle(video._id, true)
                        : undefined
                    }
                  >
                    <div className={cn(
                      "relative aspect-video bg-[var(--surface-alt)] overflow-hidden border-2 border-[var(--border)] shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all",
                      isSelected && "outline-2 outline-offset-2 outline-[var(--accent)]",
                    )}>
                      {thumbnailSrc ? (
                        <img
                          src={thumbnailSrc}
                          alt={video.title}
                          className="object-cover w-full h-full"
                          decoding="async"
                          fetchPriority={shouldPrioritizePoster ? "high" : "auto"}
                          loading={shouldPrioritizePoster ? "eager" : "lazy"}
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
                    {canSelectVideos && (
                      <SelectionCheckbox
                        checked={isSelected}
                        visible={selectionActive}
                        label={`Select ${video.title}`}
                        onToggle={(extendRange) => selection.toggle(video._id, extendRange)}
                        className="absolute bottom-2 left-2"
                      />
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
                          {canManageSharing ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleShareVideo(video);
                              }}
                            >
                              <LinkIcon className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                          ) : null}
                          {canEditProject && (
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
                    <ExpandableTitle
                      title={video.title}
                      className="text-[15px] text-[var(--foreground)] font-black leading-tight"
                    />
                    <div className="mt-1.5 flex items-center gap-3">
                      <WorkflowStatusBadge status={video.workflowStatus} />
                      {video.commentCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--foreground-muted)]">
                          <MessageSquare className="h-3 w-3" />
                          {video.commentCount}
                          {video.commentCountIsCapped ? "+" : ""}
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
            {videos?.map((video, index) => {
              const thumbnailSrc =
                videoPosterUrls[video._id] ??
                (video.thumbnailUrl?.startsWith("http") ? video.thumbnailUrl : undefined);
              const canDownload = Boolean(video.s3Key) && video.status !== "failed" && video.status !== "uploading";
              const watchingCount =
                projectPresenceCounts?.counts?.[video._id] ?? 0;
              const shouldPrioritizePoster = index < EAGER_POSTER_COUNT;
              const isSelected = selection.selectedIds.has(video._id);

              return (
                <VideoIntentTarget
                  key={video._id}
                  className="group flex items-center gap-5 px-6 py-3 hover:bg-[var(--surface-alt)] cursor-pointer transition-colors"
                  teamSlug={resolvedTeamSlug}
                  projectId={project._id}
                  videoId={video._id}
                  onOpen={() =>
                    navigate({
                      to: videoPath(resolvedTeamSlug, project._id, video._id),
                    })
                  }
                  onShiftSelect={
                    canSelectVideos
                      ? () => selection.toggle(video._id, true)
                      : undefined
                  }
                >
                  {/* Thumbnail */}
                  <div className={cn(
                    "relative w-44 aspect-video bg-[var(--surface-alt)] overflow-hidden border-2 border-[var(--border)] shrink-0 shadow-[4px_4px_0px_0px_var(--shadow-color)] group-hover:translate-y-[2px] group-hover:translate-x-[2px] group-hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] transition-all",
                    isSelected && "outline-2 outline-offset-2 outline-[var(--accent)]",
                  )}>
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt={video.title}
                        className="object-cover w-full h-full"
                        decoding="async"
                        fetchPriority={shouldPrioritizePoster ? "high" : "auto"}
                        loading={shouldPrioritizePoster ? "eager" : "lazy"}
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
                    {canSelectVideos && (
                      <SelectionCheckbox
                        checked={isSelected}
                        visible={selectionActive}
                        label={`Select ${video.title}`}
                        onToggle={(extendRange) => selection.toggle(video._id, extendRange)}
                        className="absolute bottom-1 left-1"
                      />
                    )}
                    {video.status === "ready" && video.duration && (
                      <div className="absolute bottom-1 right-1 bg-[var(--media-overlay-strong)] text-[var(--media-text)] text-[10px] font-mono px-1 py-0.5">
                        {formatDuration(video.duration)}
                      </div>
                    )}
                  </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <ExpandableTitle
                    title={video.title}
                    className="font-black text-[var(--foreground)]"
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <WorkflowStatusBadge status={video.workflowStatus} />
                    {video.commentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {video.commentCount}
                        {video.commentCountIsCapped ? "+" : ""}
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
                      {canEditProject ? (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleShareVideo(video);
                          }}
                        >
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Share
                        </DropdownMenuItem>
                      ) : null}
                      {canEditProject && (
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

      {selectionActive ? (
        <VideoSelectionBar
          count={selection.selectedIds.size}
          onMove={canEditProject ? () => setMoveDialogOpen(true) : undefined}
          onSetStatus={
            canEditProject ? (status) => void handleBulkStatus(status) : undefined
          }
          onDelete={canDeleteVideos ? () => void handleBulkDelete() : undefined}
          onClear={selection.clear}
        />
      ) : null}

      {canSelectVideos ? (
        <MoveVideosDialog
          teamId={project?.teamId}
          currentProjectId={resolvedProjectId}
          count={selection.selectedIds.size}
          open={moveDialogOpen && selection.selectedIds.size > 0}
          moving={isBulkMoving}
          onOpenChange={setMoveDialogOpen}
          onMoveTo={(projectId) => void handleBulkMoveTo(projectId)}
        />
      ) : null}

      {bulkError ? (
        // z-[60] keeps the alert above the move dialog's overlay (z-50), so a
        // failed move stays visible while the dialog is still open.
        <div className="fixed bottom-4 left-4 z-[60]" role="alert">
          <div className="flex items-start gap-3 border-2 border-[var(--destructive)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--destructive)] shadow-[4px_4px_0px_0px_var(--shadow-color)]">
            <span>{bulkError}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setBulkError(null)}
              className="mt-0.5 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
