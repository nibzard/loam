import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import { Id } from "@convex/_generated/dataModel";

import {
  buildProjectVideosListArgs,
  createProjectVideoSortStore,
  DEFAULT_PROJECT_VIDEO_SORT,
  getProjectEssentialSpecs,
  isProjectDataConsistent,
  parseProjectVideoSort,
  PROJECT_VIDEO_SORTS,
  PROJECT_VIDEO_SORT_STORAGE_KEY,
  readProjectVideoSortPreference,
  resolveProjectVideoSortStorageEvent,
  resolveStoredProjectVideoSort,
  type ProjectVideoSortStorage,
} from "./-project.data";

const projectA = "proj_aaa" as Id<"projects">;
const projectB = "proj_bbb" as Id<"projects">;

function fakeSortStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  } satisfies ProjectVideoSortStorage;
}

test("holds data back while the context or project is still loading", () => {
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: undefined }),
    false,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: projectA, project: undefined }),
    false,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: { _id: projectA } }),
    false,
  );
});

test("accepts a project document that matches the resolved context", () => {
  assert.equal(
    isProjectDataConsistent({
      resolvedProjectId: projectA,
      project: { _id: projectA },
    }),
    true,
  );
});

test("rejects a prewarmed or stale document for another project", () => {
  assert.equal(
    isProjectDataConsistent({
      resolvedProjectId: projectA,
      project: { _id: projectB },
    }),
    false,
  );
});

test("keeps a definitive not-found answer for the resolved context", () => {
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: projectA, project: null }),
    true,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: null }),
    false,
  );
});

test("accepts exactly the videos.list sort values the backend defines", () => {
  assert.deepEqual([...PROJECT_VIDEO_SORTS], [
    "recent",
    "title-asc",
    "title-desc",
  ]);
  assert.equal(DEFAULT_PROJECT_VIDEO_SORT, "recent");
});

test("parses only known sort values", () => {
  assert.equal(parseProjectVideoSort("recent"), "recent");
  assert.equal(parseProjectVideoSort("title-asc"), "title-asc");
  assert.equal(parseProjectVideoSort("title-desc"), "title-desc");
  assert.equal(parseProjectVideoSort("alphabetical"), undefined);
  assert.equal(parseProjectVideoSort(""), undefined);
  assert.equal(parseProjectVideoSort(null), undefined);
  assert.equal(parseProjectVideoSort(undefined), undefined);
});

test("reads the stored sort and falls back to recent", () => {
  assert.equal(
    resolveStoredProjectVideoSort({ storedValue: "title-desc" }),
    "title-desc",
  );
  assert.equal(resolveStoredProjectVideoSort({ storedValue: null }), "recent");
  assert.equal(resolveStoredProjectVideoSort({ storedValue: "bogus" }), "recent");

  assert.equal(
    readProjectVideoSortPreference(
      fakeSortStorage({ [PROJECT_VIDEO_SORT_STORAGE_KEY]: "title-asc" }),
    ),
    "title-asc",
  );
  assert.equal(readProjectVideoSortPreference(fakeSortStorage()), "recent");
  assert.equal(
    readProjectVideoSortPreference(
      fakeSortStorage({ [PROJECT_VIDEO_SORT_STORAGE_KEY]: "bogus" }),
    ),
    "recent",
  );
  // No window in this environment: no storage at all still yields the default.
  assert.equal(readProjectVideoSortPreference(), "recent");
});

test("storage events update the sort only for the sort key", () => {
  const event = (key: string | null, newValue: string | null) =>
    resolveProjectVideoSortStorageEvent({
      key,
      newValue,
      storageKey: PROJECT_VIDEO_SORT_STORAGE_KEY,
    });

  assert.equal(event("other:key", "title-asc"), null);
  assert.equal(event(PROJECT_VIDEO_SORT_STORAGE_KEY, "title-asc"), "title-asc");
  assert.equal(event(PROJECT_VIDEO_SORT_STORAGE_KEY, "bogus"), "recent");
  // storage.clear() reports a null key and resets to the default.
  assert.equal(event(null, null), "recent");
});

test("sort store persists, notifies, and re-reads storage on resubscribe", () => {
  const storage = fakeSortStorage({ [PROJECT_VIDEO_SORT_STORAGE_KEY]: "title-desc" });
  const store = createProjectVideoSortStore({
    storageKey: PROJECT_VIDEO_SORT_STORAGE_KEY,
    getStorage: () => storage,
  });

  // The server snapshot never reads storage, so SSR and hydration agree.
  assert.equal(store.getServerSnapshot(), "recent");

  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  // First client snapshot lazily reads storage.
  assert.equal(store.getSnapshot(), "title-desc");

  store.setSort("title-asc");
  assert.equal(store.getSnapshot(), "title-asc");
  assert.equal(storage.getItem(PROJECT_VIDEO_SORT_STORAGE_KEY), "title-asc");
  assert.equal(notifications, 1);

  // After the last unsubscribe the store forgets its initialized value, so a
  // reused store re-reads storage instead of serving stale memory.
  unsubscribe();
  storage.setItem(PROJECT_VIDEO_SORT_STORAGE_KEY, "recent");
  assert.equal(store.getSnapshot(), "recent");
});

test("sort store keeps the in-memory value when storage writes fail", () => {
  const storage: ProjectVideoSortStorage = {
    getItem: () => "recent",
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  const store = createProjectVideoSortStore({
    storageKey: PROJECT_VIDEO_SORT_STORAGE_KEY,
    getStorage: () => storage,
  });
  store.subscribe(() => {});

  store.setSort("title-asc");
  assert.equal(store.getSnapshot(), "title-asc");
});

test("videos.list args carry the sort for the prewarm contract", () => {
  assert.deepEqual(buildProjectVideosListArgs({ projectId: projectA, sort: "title-asc" }), {
    projectId: projectA,
    sort: "title-asc",
  });

  const specByName = new Map(
    getProjectEssentialSpecs({ teamSlug: "garden", projectId: projectA, sort: "title-desc" }).map(
      (spec) => [getFunctionName(spec.query as never), spec.args],
    ),
  );
  assert.deepEqual(specByName.get("videos:list"), {
    projectId: projectA,
    sort: "title-desc",
  });
  // Omitting the sort prewarms the default order.
  const defaultSpecArgs = new Map(
    getProjectEssentialSpecs({ teamSlug: "garden", projectId: projectA }).map((spec) => [
      getFunctionName(spec.query as never),
      spec.args,
    ]),
  );
  assert.deepEqual(defaultSpecArgs.get("videos:list"), {
    projectId: projectA,
    sort: "recent",
  });
});
