import { useQuery, type ConvexReactClient } from "convex/react";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  makeRouteQuerySpec,
  prewarmSpecs,
} from "@/lib/convexRouteData";

// ---------------------------------------------------------------------------
// Video sort order
// ---------------------------------------------------------------------------

/**
 * Sort orders `videos.list` accepts (upstream aaf96d8 + 0c2a980's simplified
 * title-based model, adapted to three states). "recent" is the default and
 * matches the pre-sort behavior. Keep in sync with `videoSortValidator` in
 * `convex/videos.ts`, which mirrors this list.
 */
export const PROJECT_VIDEO_SORTS = [
  "recent",
  "title-asc",
  "title-desc",
] as const;

export type ProjectVideoSort = (typeof PROJECT_VIDEO_SORTS)[number];

export const DEFAULT_PROJECT_VIDEO_SORT: ProjectVideoSort = "recent";

export const PROJECT_VIDEO_SORT_STORAGE_KEY = "loam:project-video-sort";

export type ProjectVideoSortStorage = Pick<Storage, "getItem" | "setItem">;

/** Stored value -> sort order. Unreadable values fall back to the default. */
export function parseProjectVideoSort(value: unknown): ProjectVideoSort | undefined {
  return typeof value === "string" &&
    (PROJECT_VIDEO_SORTS as readonly string[]).includes(value)
    ? (value as ProjectVideoSort)
    : undefined;
}

export function resolveStoredProjectVideoSort(args: {
  storedValue: string | null;
}): ProjectVideoSort {
  return parseProjectVideoSort(args.storedValue) ?? DEFAULT_PROJECT_VIDEO_SORT;
}

/**
 * Storage event -> next sort order, or null when the event is for another key
 * and must be ignored. A null `key` means `storage.clear()`, which resets to
 * the default (same semantics as the discussion sidebar store).
 */
export function resolveProjectVideoSortStorageEvent(args: {
  key: string | null;
  newValue: string | null;
  storageKey: string;
}): ProjectVideoSort | null {
  if (args.key === null) return DEFAULT_PROJECT_VIDEO_SORT;
  if (args.key !== args.storageKey) return null;
  return resolveStoredProjectVideoSort({ storedValue: args.newValue });
}

function defaultGetProjectVideoSortStorage(): ProjectVideoSortStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Some privacy modes throw on localStorage access.
    return null;
  }
}

/** Reads the persisted sort order. Client-only callers only. */
export function readProjectVideoSortPreference(
  storage?: ProjectVideoSortStorage,
): ProjectVideoSort {
  const store = storage ?? defaultGetProjectVideoSortStorage();
  if (!store) return DEFAULT_PROJECT_VIDEO_SORT;
  try {
    return resolveStoredProjectVideoSort({
      storedValue: store.getItem(PROJECT_VIDEO_SORT_STORAGE_KEY),
    });
  } catch {
    return DEFAULT_PROJECT_VIDEO_SORT;
  }
}

export type ProjectVideoSortStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ProjectVideoSort;
  /** Never reads storage, so server render and hydration render always agree. */
  getServerSnapshot(): ProjectVideoSort;
  setSort(next: ProjectVideoSort): void;
};

/**
 * localStorage-backed sort store, same `useSyncExternalStore` pattern as the
 * discussion sidebar (upstream 0eb7594): lazy client-side initialization, a
 * `getServerSnapshot` that reports the default until hydration finishes, and
 * `storage` event sync so tabs agree. Subscribing again after the last
 * unsubscribe re-reads storage, so a reused store never serves stale memory.
 */
export function createProjectVideoSortStore(args: {
  storageKey: string;
  getStorage?: () => ProjectVideoSortStorage | null;
}): ProjectVideoSortStore {
  const getStorage = args.getStorage ?? defaultGetProjectVideoSortStorage;
  const listeners = new Set<() => void>();

  let sort = DEFAULT_PROJECT_VIDEO_SORT;
  let initialized = false;

  function initialize() {
    if (initialized) return;
    const storage = getStorage();
    if (!storage) return;

    initialized = true;
    try {
      sort = resolveStoredProjectVideoSort({
        storedValue: storage.getItem(args.storageKey),
      });
    } catch {
      // Keep the in-memory value when storage reads fail.
    }
  }

  function emitChange() {
    for (const listener of listeners) {
      listener();
    }
  }

  function handleStorageEvent(event: StorageEvent) {
    const next = resolveProjectVideoSortStorageEvent({
      key: event.key,
      newValue: event.newValue,
      storageKey: args.storageKey,
    });
    if (next === null) return;

    initialized = true;
    sort = next;
    emitChange();
  }

  function setSortInternal(next: ProjectVideoSort) {
    sort = next;
    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(args.storageKey, next);
      } catch {
        // The in-memory value remains usable when storage writes fail.
      }
    }
    emitChange();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") {
        window.addEventListener("storage", handleStorageEvent);
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          // Re-read storage if a store is reused after everyone unsubscribed.
          initialized = false;
          if (typeof window !== "undefined") {
            window.removeEventListener("storage", handleStorageEvent);
          }
        }
      };
    },
    getSnapshot() {
      initialize();
      return sort;
    },
    getServerSnapshot() {
      return DEFAULT_PROJECT_VIDEO_SORT;
    },
    setSort(next) {
      initialize();
      setSortInternal(next);
    },
  };
}

const projectVideoSortStore = createProjectVideoSortStore({
  storageKey: PROJECT_VIDEO_SORT_STORAGE_KEY,
});

/**
 * Project-page video sort order persisted to localStorage, shared across every
 * mount. SSR-safe for the same reason as `useSidebarOpen`: the server snapshot
 * is the default until hydration finishes, then the client snapshot lazily
 * reads storage.
 */
export function useProjectVideoSort() {
  const sort = useSyncExternalStore(
    projectVideoSortStore.subscribe,
    projectVideoSortStore.getSnapshot,
    projectVideoSortStore.getServerSnapshot,
  );

  const setSort = useCallback((next: ProjectVideoSort) => {
    projectVideoSortStore.setSort(next);
  }, []);

  return [sort, setSort] as const;
}

/**
 * `videos.list` args for the project page, including the `sort` argument.
 * Built through a helper so every caller (live query, prewarm spec, tests)
 * constructs the same shape from one place.
 */
export function buildProjectVideosListArgs(args: {
  projectId: Id<"projects">;
  sort: ProjectVideoSort;
}) {
  return { projectId: args.projectId, sort: args.sort };
}

export function getProjectEssentialSpecs(params: {
  teamSlug: string;
  projectId: Id<"projects">;
  /** Sort for the prewarmed video list. Omit to prewarm the default order. */
  sort?: ProjectVideoSort;
}) {
  return [
    makeRouteQuerySpec(api.workspace.resolveContext, {
      teamSlug: params.teamSlug,
      projectId: params.projectId,
    }),
    makeRouteQuerySpec(api.projects.get, {
      projectId: params.projectId,
    }),
    makeRouteQuerySpec(
      api.videos.list,
      buildProjectVideosListArgs({
        projectId: params.projectId,
        sort: params.sort ?? DEFAULT_PROJECT_VIDEO_SORT,
      }),
    ),
  ];
}

// Guards prewarmed project rendering (upstream 8f98027): while the route
// re-resolves, the video list can arrive from a prewarmed query before the
// project document catches up. Data is only consistent when the project
// document belongs to the resolved context, or is definitively missing from
// it. Otherwise consumers would render one project's videos under another
// project's document, or crash on a still-loading document.
export function isProjectDataConsistent(input: {
  resolvedProjectId: Id<"projects"> | undefined;
  project: { _id: Id<"projects"> } | null | undefined;
}): boolean {
  if (input.project === null) {
    // A definitive not-found answer for the requested context.
    return input.resolvedProjectId !== undefined;
  }

  if (!input.resolvedProjectId || !input.project) {
    return false;
  }

  return input.project._id === input.resolvedProjectId;
}

export function useProjectData(params: {
  teamSlug: string;
  projectId: Id<"projects">;
  sort: ProjectVideoSort;
}) {
  const context = useQuery(api.workspace.resolveContext, {
    teamSlug: params.teamSlug,
    projectId: params.projectId,
  });
  const resolvedProjectId = context?.project?._id;
  const resolvedTeamSlug = context?.team.slug ?? params.teamSlug;
  const project = useQuery(
    api.projects.get,
    resolvedProjectId ? { projectId: resolvedProjectId } : "skip",
  );
  const videos = useQuery(
    api.videos.list,
    resolvedProjectId
      ? buildProjectVideosListArgs({
          projectId: resolvedProjectId,
          sort: params.sort,
        })
      : "skip",
  );
  const isConsistent = isProjectDataConsistent({ resolvedProjectId, project });

  return {
    context,
    resolvedProjectId,
    resolvedTeamSlug,
    project: isConsistent ? project : undefined,
    videos: isConsistent ? videos : undefined,
  };
}

export async function prewarmProject(
  convex: ConvexReactClient,
  params: {
    teamSlug: string;
    projectId: Id<"projects">;
  },
) {
  // Prewarm with the persisted sort so the prewarmed subscription matches the
  // project page's subscription; a different sort would fetch a list the page
  // immediately discards. Runs on hover intent, always client-side.
  prewarmSpecs(
    convex,
    getProjectEssentialSpecs({
      ...params,
      sort: readProjectVideoSortPreference(),
    }),
  );
}
