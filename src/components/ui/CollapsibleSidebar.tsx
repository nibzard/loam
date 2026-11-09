"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Collapsible sidebar primitive, ported from upstream lawn's collapsible
 * discussion sidebar (a3ccb86, hardened in 251e899 and 0eb7594).
 *
 * The collapsed panel stays in the DOM but is fully inert: `inert` blocks
 * focus, pointer events, and the accessibility tree, `aria-hidden` mirrors
 * that for older assistive tech, and the panel width collapses to zero.
 *
 * Rendering is driven by props only, so the server and the first client
 * render always match. Persisted state belongs in `useSidebarOpen`, whose
 * `getServerSnapshot` returns the default until hydration finishes — the
 * `useSyncExternalStore` pattern upstream landed on in 0eb7594.
 */

export type CollapsibleSidebarSide = "left" | "right";

export const DEFAULT_SIDEBAR_WIDTH_CLASS = "w-80 xl:w-96";

export type SidebarPanelState = {
  /** Sets the HTML `inert` attribute: no focus, no pointer events, no a11y tree. */
  isInert: boolean;
  /** Mirrors `inert` for assistive tech that lacks `inert` support. */
  isAriaHidden: boolean;
  /** False only in the collapsed state; gates `pointer-events-none`. */
  isInteractive: boolean;
};

/**
 * Single source of truth for the collapsed invariants. Everything is derived
 * from one boolean so inertness, aria-hidden, and pointer events cannot drift
 * apart.
 */
export function resolveSidebarPanelState(args: { isOpen: boolean }): SidebarPanelState {
  return {
    isInert: !args.isOpen,
    isAriaHidden: !args.isOpen,
    isInteractive: args.isOpen,
  };
}

/**
 * Panel class resolution. Open: fixed width with an animatable `max-w-full`
 * ceiling. Collapsed: `max-w-0` + `overflow-hidden` clamp the box to zero
 * width for any `widthClass`, and the inner border is dropped so no 2px sliver
 * remains. `cn` (tailwind-merge) lets the collapsed utilities win over the
 * open ones.
 */
export function resolveSidebarPanelClassName(args: {
  isOpen: boolean;
  side?: CollapsibleSidebarSide;
  widthClass?: string;
  className?: string;
}): string {
  const side = args.side ?? "right";

  return cn(
    "flex max-w-full flex-col overflow-hidden bg-[var(--background)] transition-[max-width] duration-300 motion-reduce:transition-none",
    side === "right" ? "border-l-2 border-[var(--border)]" : "border-r-2 border-[var(--border)]",
    args.widthClass ?? DEFAULT_SIDEBAR_WIDTH_CLASS,
    args.className,
    args.isOpen
      ? undefined
      : side === "right"
        ? "pointer-events-none max-w-0 border-l-0"
        : "pointer-events-none max-w-0 border-r-0",
  );
}

/** Accessible toggle label: "Hide discussion sidebar" / "Show discussion sidebar". */
export function resolveToggleLabel(args: { isOpen: boolean; label?: string }): string {
  const label = args.label ?? "discussion sidebar";
  return `${args.isOpen ? "Hide" : "Show"} ${label}`;
}

export type SidebarOpenStorage = Pick<Storage, "getItem" | "setItem">;

function defaultGetStorage(): SidebarOpenStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Some privacy modes throw on localStorage access.
    return null;
  }
}

/** Stored value -> open boolean. Unreadable values fall back to the default. */
export function resolveStoredOpen(args: {
  storedValue: string | null;
  defaultOpen: boolean;
}): boolean {
  if (args.storedValue === "1") return true;
  if (args.storedValue === "0") return false;
  return args.defaultOpen;
}

/**
 * Storage event -> next open boolean, or null when the event is for another
 * key and must be ignored. A null `key` means `storage.clear()`, which resets
 * to the default (upstream 0eb7594 behavior).
 */
export function resolveStorageEventOpen(args: {
  key: string | null;
  newValue: string | null;
  storageKey: string;
  defaultOpen: boolean;
}): boolean | null {
  if (args.key === null) return args.defaultOpen;
  if (args.key !== args.storageKey) return null;
  return resolveStoredOpen({ storedValue: args.newValue, defaultOpen: args.defaultOpen });
}

export type SidebarOpenStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): boolean;
  /** Never reads storage, so server render and hydration render always agree. */
  getServerSnapshot(): boolean;
  setOpen(next: boolean): void;
  toggle(): void;
};

export function createSidebarOpenStore(args: {
  storageKey: string;
  defaultOpen?: boolean;
  getStorage?: () => SidebarOpenStorage | null;
}): SidebarOpenStore {
  const defaultOpen = args.defaultOpen ?? true;
  const getStorage = args.getStorage ?? defaultGetStorage;
  const listeners = new Set<() => void>();

  let isOpen = defaultOpen;
  let initialized = false;

  function initialize() {
    if (initialized) return;
    const storage = getStorage();
    if (!storage) return;

    initialized = true;
    try {
      isOpen = resolveStoredOpen({
        storedValue: storage.getItem(args.storageKey),
        defaultOpen,
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
    const next = resolveStorageEventOpen({
      key: event.key,
      newValue: event.newValue,
      storageKey: args.storageKey,
      defaultOpen,
    });
    if (next === null) return;

    initialized = true;
    isOpen = next;
    emitChange();
  }

  function setOpenInternal(next: boolean) {
    isOpen = next;
    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(args.storageKey, next ? "1" : "0");
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
      return isOpen;
    },
    getServerSnapshot() {
      return defaultOpen;
    },
    setOpen(next) {
      initialize();
      setOpenInternal(next);
    },
    toggle() {
      initialize();
      setOpenInternal(!isOpen);
    },
  };
}

const DISCUSSION_SIDEBAR_STORAGE_KEY = "loam:discussion-sidebar-open";

const discussionSidebarOpenStore = createSidebarOpenStore({
  storageKey: DISCUSSION_SIDEBAR_STORAGE_KEY,
});

/**
 * Discussion-sidebar open state persisted to localStorage, shared across every
 * mount. SSR-safe: `getServerSnapshot` reports the default until hydration
 * finishes, then the client snapshot lazily reads storage — no hydration
 * mismatch (the bug 251e899 fixed and 0eb7594 finalized upstream).
 */
export function useSidebarOpen() {
  const isOpen = useSyncExternalStore(
    discussionSidebarOpenStore.subscribe,
    discussionSidebarOpenStore.getSnapshot,
    discussionSidebarOpenStore.getServerSnapshot,
  );

  const toggle = useCallback(() => {
    discussionSidebarOpenStore.toggle();
  }, []);

  return [isOpen, toggle] as const;
}

export type CollapsibleSidebarToggleState = {
  isOpen: boolean;
  panelId: string;
  toggleLabel: string;
  toggle: () => void;
  /** Spread onto a custom control to keep the aria wiring correct. */
  toggleProps: {
    type: "button";
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-label": string;
  };
};

export type CollapsibleSidebarProps = {
  children: ReactNode;
  /** Which screen edge the panel hugs; the toggle renders on the opposite side. */
  side?: CollapsibleSidebarSide;
  /** Initial state for uncontrolled use. Must be stable across server and client. */
  defaultOpen?: boolean;
  /** Controlled state. Pass this when driving the panel from `useSidebarOpen`. */
  open?: boolean;
  /** Called with the next state after every toggle; use it to persist. */
  onToggle?: (isOpen: boolean) => void;
  /** Width utilities for the open panel, for example "w-80 xl:w-96". */
  widthClass?: string;
  /** Named region for aria-labels, for example "discussion sidebar". */
  label?: string;
  /** Panel id; derived from `useId()` when omitted. Needed for a slot toggle elsewhere in the page. */
  id?: string;
  /** Extra panel classes, for example responsive visibility like "hidden lg:flex". */
  className?: string;
  /** Custom toggle control. Receives state and ready-to-spread `toggleProps`. */
  toggle?: (state: CollapsibleSidebarToggleState) => ReactNode;
  /** Classes for the built-in toggle button. */
  toggleClassName?: string;
};

export function CollapsibleSidebar({
  children,
  side = "right",
  defaultOpen = true,
  open,
  onToggle,
  widthClass,
  label,
  id,
  className,
  toggle,
  toggleClassName,
}: CollapsibleSidebarProps) {
  const generatedId = useId();
  const panelId = id ?? generatedId;
  const panelLabel = label ?? "discussion sidebar";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  }, [isOpen, isControlled, onToggle]);

  // Collapsing must not leave focus inside the now-inert panel.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isOpen) return;

    const panel = panelRef.current;
    const activeElement =
      typeof document === "undefined" ? null : document.activeElement;
    if (panel && activeElement instanceof HTMLElement && panel.contains(activeElement)) {
      activeElement.blur();
    }
  }, [isOpen]);

  const panelState = resolveSidebarPanelState({ isOpen });
  const toggleLabel = resolveToggleLabel({ isOpen, label });
  const toggleState: CollapsibleSidebarToggleState = {
    isOpen,
    panelId,
    toggleLabel,
    toggle: handleToggle,
    toggleProps: {
      type: "button",
      onClick: handleToggle,
      "aria-expanded": isOpen,
      "aria-controls": panelId,
      "aria-label": toggleLabel,
    },
  };

  const toggleControl = toggle ? (
    toggle(toggleState)
  ) : (
    <button
      {...toggleState.toggleProps}
      className={cn(
        "flex h-8 min-w-8 shrink-0 items-center justify-center self-start border-2 border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)] transition-colors hover:bg-[var(--foreground)] hover:text-[var(--foreground-inverse)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]",
        toggleClassName,
      )}
    >
      {isOpen ? "Hide" : "Show"}
    </button>
  );

  const panel = (
    <aside
      id={panelId}
      ref={panelRef}
      className={resolveSidebarPanelClassName({ isOpen, side, widthClass, className })}
      aria-label={panelLabel}
      aria-hidden={panelState.isAriaHidden}
      inert={panelState.isInert}
    >
      {children}
    </aside>
  );

  return side === "right" ? (
    <>
      {toggleControl}
      {panel}
    </>
  ) : (
    <>
      {panel}
      {toggleControl}
    </>
  );
}
