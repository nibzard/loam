import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SIDEBAR_WIDTH_CLASS,
  createSidebarOpenStore,
  resolveSidebarPanelClassName,
  resolveSidebarPanelState,
  resolveStorageEventOpen,
  resolveStoredOpen,
  resolveToggleLabel,
  type SidebarOpenStorage,
} from "./CollapsibleSidebar";

function tokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

test("panel state is fully inert only when collapsed", () => {
  assert.deepEqual(resolveSidebarPanelState({ isOpen: true }), {
    isInert: false,
    isAriaHidden: false,
    isInteractive: true,
  });

  assert.deepEqual(resolveSidebarPanelState({ isOpen: false }), {
    isInert: true,
    isAriaHidden: true,
    isInteractive: false,
  });
});

test("open panel keeps its width and side border", () => {
  const className = resolveSidebarPanelClassName({ isOpen: true, side: "right" });
  const classes = tokens(className);

  assert.ok(classes.has("border-l-2"));
  assert.ok(classes.has("max-w-full"));
  for (const token of tokens(DEFAULT_SIDEBAR_WIDTH_CLASS)) {
    assert.ok(classes.has(token), `expected ${token}`);
  }
  assert.equal(classes.has("max-w-0"), false);
  assert.equal(classes.has("pointer-events-none"), false);
});

test("collapsed right panel clamps width, drops its border, and blocks pointer events", () => {
  const classes = tokens(resolveSidebarPanelClassName({ isOpen: false, side: "right" }));

  assert.ok(classes.has("max-w-0"));
  assert.ok(classes.has("pointer-events-none"));
  assert.ok(classes.has("overflow-hidden"));
  assert.ok(classes.has("border-l-0"));
  // tailwind-merge must drop the open-state border width, not stack both.
  assert.equal(classes.has("border-l-2"), false);
  // The left variant must stay untouched so the wrong edge never goes bare.
  assert.equal(classes.has("border-r-0"), false);
});

test("collapsed left panel drops its right border", () => {
  const classes = tokens(resolveSidebarPanelClassName({ isOpen: false, side: "left" }));

  assert.ok(classes.has("border-r-0"));
  assert.equal(classes.has("border-r-2"), false);
  assert.equal(classes.has("border-l-0"), false);
  assert.ok(classes.has("max-w-0"));
});

test("open left panel carries its right border", () => {
  const classes = tokens(resolveSidebarPanelClassName({ isOpen: true, side: "left" }));

  assert.ok(classes.has("border-r-2"));
  assert.equal(classes.has("border-l-2"), false);
});

test("custom width and className merge without leftovers", () => {
  const open = tokens(
    resolveSidebarPanelClassName({
      isOpen: true,
      widthClass: "w-64",
      className: "hidden lg:flex",
    }),
  );

  assert.ok(open.has("w-64"));
  assert.equal(open.has("w-80"), false);
  // Display utilities conflict-resolve toward the caller's responsive set.
  assert.ok(open.has("hidden"));
  assert.ok(open.has("lg:flex"));
  assert.equal(open.has("flex"), false);
  assert.ok(open.has("flex-col"));
});

test("toggle label states the action and the region", () => {
  assert.equal(resolveToggleLabel({ isOpen: true }), "Hide discussion sidebar");
  assert.equal(resolveToggleLabel({ isOpen: false }), "Show discussion sidebar");
  assert.equal(resolveToggleLabel({ isOpen: false, label: "filters" }), "Show filters");
});

test("stored values map to open booleans with a default fallback", () => {
  assert.equal(resolveStoredOpen({ storedValue: "1", defaultOpen: false }), true);
  assert.equal(resolveStoredOpen({ storedValue: "0", defaultOpen: true }), false);
  assert.equal(resolveStoredOpen({ storedValue: null, defaultOpen: true }), true);
  assert.equal(resolveStoredOpen({ storedValue: "garbage", defaultOpen: false }), false);
});

test("storage events resolve, reset on clear, and ignore other keys", () => {
  const args = { storageKey: "loam:discussion-sidebar-open", defaultOpen: true };

  assert.equal(
    resolveStorageEventOpen({ ...args, key: args.storageKey, newValue: "0" }),
    false,
  );
  assert.equal(
    resolveStorageEventOpen({ ...args, key: args.storageKey, newValue: "1" }),
    true,
  );
  assert.equal(
    resolveStorageEventOpen({ ...args, key: args.storageKey, newValue: "garbage" }),
    true,
  );
  // A null key means storage.clear(): fall back to the default.
  assert.equal(resolveStorageEventOpen({ ...args, key: null, newValue: null }), true);
  // Events for other keys must be ignored (null sentinel).
  assert.equal(
    resolveStorageEventOpen({ ...args, key: "loam-theme", newValue: "dark" }),
    null,
  );
});

type FakeStorage = SidebarOpenStorage & { data: Map<string, string> };

function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("server snapshot always reports the default, whatever storage holds", () => {
  const storage = createFakeStorage({ "loam:discussion-sidebar-open": "0" });
  const store = createSidebarOpenStore({
    storageKey: "loam:discussion-sidebar-open",
    getStorage: () => storage,
  });

  // The client snapshot reads storage, but the hydration snapshot must not,
  // or server HTML and first client render would disagree.
  assert.equal(store.getSnapshot(), false);
  assert.equal(store.getServerSnapshot(), true);
});

test("snapshot falls back to the default without storage (SSR)", () => {
  const store = createSidebarOpenStore({
    storageKey: "loam:discussion-sidebar-open",
    getStorage: () => null,
  });

  assert.equal(store.getSnapshot(), true);
  assert.equal(store.getServerSnapshot(), true);
});

test("unreadable storage falls back to the default without throwing", () => {
  const store = createSidebarOpenStore({
    storageKey: "loam:discussion-sidebar-open",
    getStorage: () => ({
      getItem: () => {
        throw new Error("quota gate");
      },
      setItem: () => {},
    }),
  });

  assert.equal(store.getSnapshot(), true);
});

test("snapshot reads storage lazily and only once", () => {
  const storage = createFakeStorage({ "loam:sidebar": "0" });
  const store = createSidebarOpenStore({
    storageKey: "loam:sidebar",
    getStorage: () => storage,
  });

  assert.equal(store.getSnapshot(), false);

  // Later storage writes only arrive through storage events, not re-reads.
  storage.data.set("loam:sidebar", "1");
  assert.equal(store.getSnapshot(), false);
});

test("toggle initializes from storage before flipping and persists the result", () => {
  const storage = createFakeStorage({ "loam:sidebar": "0" });
  const store = createSidebarOpenStore({
    storageKey: "loam:sidebar",
    getStorage: () => storage,
  });

  store.toggle();

  assert.equal(store.getSnapshot(), true);
  assert.equal(storage.data.get("loam:sidebar"), "1");
});

test("setOpen and toggle notify subscribers", () => {
  const storage = createFakeStorage();
  const store = createSidebarOpenStore({
    storageKey: "loam:sidebar",
    getStorage: () => storage,
  });
  const seen: boolean[] = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()));

  store.setOpen(false);
  store.toggle();

  assert.deepEqual(seen, [false, true]);
  assert.equal(storage.data.get("loam:sidebar"), "1");
  unsubscribe();
});

test("state survives storage write failures", () => {
  const store = createSidebarOpenStore({
    storageKey: "loam:sidebar",
    getStorage: () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    }),
  });
  const seen: boolean[] = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()));

  store.toggle();

  assert.equal(store.getSnapshot(), false);
  assert.deepEqual(seen, [false]);
  unsubscribe();
});

test("re-subscribing after everyone leaves re-reads storage", () => {
  const storage = createFakeStorage({ "loam:sidebar": "0" });
  const store = createSidebarOpenStore({
    storageKey: "loam:sidebar",
    getStorage: () => storage,
  });

  const firstUnsubscribe = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), false);
  firstUnsubscribe();

  storage.data.set("loam:sidebar", "1");
  store.subscribe(() => {});
  assert.equal(store.getSnapshot(), true);
});

type FakeStorageEventHandler = (event: {
  key: string | null;
  newValue: string | null;
}) => void;

function createFakeWindow() {
  const handlers = new Set<FakeStorageEventHandler>();
  return {
    addEventListener(type: string, handler: unknown) {
      if (type === "storage") handlers.add(handler as FakeStorageEventHandler);
    },
    removeEventListener(type: string, handler: unknown) {
      if (type === "storage") handlers.delete(handler as FakeStorageEventHandler);
    },
    dispatch(event: { key: string | null; newValue: string | null }) {
      for (const handler of [...handlers]) handler(event);
    },
  };
}

function withFakeWindow<T>(
  fakeWindow: ReturnType<typeof createFakeWindow>,
  run: (fakeWindow: ReturnType<typeof createFakeWindow>) => T,
): T {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  globals.window = fakeWindow;
  try {
    return run(fakeWindow);
  } finally {
    if (previous === undefined) {
      delete globals.window;
    } else {
      globals.window = previous;
    }
  }
}

test("storage events from other tabs update the snapshot", () => {
  withFakeWindow(createFakeWindow(), (fakeWindow) => {
    const storage = createFakeStorage({ "loam:sidebar": "1" });
    const store = createSidebarOpenStore({
      storageKey: "loam:sidebar",
      getStorage: () => storage,
    });
    const seen: boolean[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()));

    assert.equal(store.getSnapshot(), true);

    fakeWindow.dispatch({ key: "loam:sidebar", newValue: "0" });
    assert.equal(store.getSnapshot(), false);
    assert.deepEqual(seen, [false]);

    // Events for other keys change nothing.
    fakeWindow.dispatch({ key: "loam-theme", newValue: "dark" });
    assert.equal(store.getSnapshot(), false);
    assert.deepEqual(seen, [false]);

    unsubscribe();
  });
});

test("unsubscribing detaches the storage event listener", () => {
  withFakeWindow(createFakeWindow(), (fakeWindow) => {
    const storage = createFakeStorage({ "loam:sidebar": "1" });
    const store = createSidebarOpenStore({
      storageKey: "loam:sidebar",
      getStorage: () => storage,
    });

    const unsubscribe = store.subscribe(() => {});
    assert.equal(store.getSnapshot(), true);
    unsubscribe();

    // The listener is gone, so a cross-tab event must not flip the snapshot.
    // Were it still attached, the snapshot would read false here.
    fakeWindow.dispatch({ key: "loam:sidebar", newValue: "0" });
    assert.equal(store.getSnapshot(), true);
  });
});
