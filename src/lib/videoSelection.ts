"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCodedErrorMessage } from "./uploadErrors";

// Mirrors MAX_BULK_VIDEO_ACTION in convex/videos.ts (not imported to keep
// server code out of the client bundle).
export const BULK_VIDEO_ACTION_LIMIT = 100;

/**
 * Friendly fallbacks per error code when a bulk mutation's coded error carries
 * no message. The bulk guards in convex/videos.ts and convex/auth.ts throw
 * { code, message }, so this only fires on shape drift.
 */
const BULK_ERROR_CODE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Sign in again to retry.",
  FORBIDDEN:
    "You no longer have access to one of these videos. Refresh the page.",
  NOT_FOUND: "One of these videos no longer exists. Refresh the page.",
};

const EMPTY_SELECTION: ReadonlySet<never> = new Set();

export function toggleSelection<T>(selected: ReadonlySet<T>, id: T) {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Adds every id between the anchor and the target (inclusive) to the selection. */
export function selectRange<T>(
  orderedIds: readonly T[],
  anchorId: T | null,
  targetId: T,
  selected: ReadonlySet<T>,
) {
  const targetIndex = orderedIds.indexOf(targetId);
  const anchorIndex = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  if (targetIndex === -1) return new Set(selected);
  if (anchorIndex === -1) return new Set(selected).add(targetId);
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set([...selected, ...orderedIds.slice(start, end + 1)]);
}

/**
 * A click on an item: extends from the anchor when `extendRange` (shift) is held
 * and there is a usable anchor, otherwise toggles. The clicked item becomes the
 * new anchor either way.
 */
export function clickSelection<T>(
  orderedIds: readonly T[],
  current: { selected: ReadonlySet<T>; anchor: T | null },
  id: T,
  extendRange: boolean,
) {
  const shouldExtend =
    extendRange &&
    current.anchor !== null &&
    current.anchor !== id &&
    orderedIds.includes(current.anchor);
  return {
    selected: shouldExtend
      ? selectRange(orderedIds, current.anchor, id, current.selected)
      : toggleSelection(current.selected, id),
    anchor: id,
  };
}

/** Drops ids that are no longer present, returning the same set when nothing changed. */
export function pruneSelection<T>(selected: ReadonlySet<T>, existingIds: ReadonlySet<T>) {
  for (const id of selected) {
    if (!existingIds.has(id)) return new Set([...selected].filter((item) => existingIds.has(item)));
  }
  return selected;
}

export function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Runs a bulk action in server-sized chunks, one at a time, stopping at the
 * first failure (upstream da236dc: parallel chunks let a later chunk land after
 * an earlier one failed, and hid how much work was already done). Each chunk is
 * its own transaction, so on failure the error says how many videos were
 * already done and the rest of the batch stays untouched.
 */
export async function runBulkVideoAction<T>(
  ids: readonly T[],
  action: (chunkIds: T[]) => Promise<unknown>,
  fallbackError: string,
) {
  let completed = 0;
  for (const chunkIds of chunk(ids, BULK_VIDEO_ACTION_LIMIT)) {
    try {
      await action(chunkIds);
    } catch (error) {
      // A failed chunk is usually a coded ConvexError (bulk limits, access
      // checks); reading `error.message` directly would surface stringified
      // JSON, so decode through the shared coded-error decoder.
      const message = getCodedErrorMessage(
        error,
        fallbackError,
        BULK_ERROR_CODE_MESSAGES,
      );
      return {
        ok: false as const,
        error: completed > 0 ? `${message} (${completed} of ${ids.length} already done)` : message,
      };
    }
    completed += chunkIds.length;
  }
  return { ok: true as const };
}

/**
 * Selection state for an ordered list of items (upstream 69b3cec). Resets when
 * `scope` changes (another project, or a different sort order — range selection
 * is only meaningful against a stable order), ignores ids no longer in
 * `orderedIds`, and clears on Escape.
 */
export function useVideoSelection<T>(orderedIds: readonly T[], scope: unknown) {
  const [state, setState] = useState<{
    scope: unknown;
    selected: ReadonlySet<T>;
    anchor: T | null;
  }>({ scope, selected: EMPTY_SELECTION, anchor: null });

  if (state.scope !== scope) {
    setState({ scope, selected: EMPTY_SELECTION, anchor: null });
  }

  const existingIds = useMemo(() => new Set(orderedIds), [orderedIds]);
  const selectedIds = useMemo(
    () => (state.scope === scope ? pruneSelection(state.selected, existingIds) : EMPTY_SELECTION),
    [existingIds, scope, state.scope, state.selected],
  );
  const anchor =
    state.scope === scope && state.anchor !== null && existingIds.has(state.anchor)
      ? state.anchor
      : null;

  const toggle = (id: T, extendRange: boolean) => {
    setState({
      scope,
      ...clickSelection(orderedIds, { selected: selectedIds, anchor }, id, extendRange),
    });
  };

  const clear = useCallback(() => {
    setState((current) => ({ ...current, selected: EMPTY_SELECTION, anchor: null }));
  }, []);

  const hasSelection = selectedIds.size > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Radix dialogs and menus mark Escape as handled when they close
      // themselves; that Escape must not also drop the selection.
      if (event.key === "Escape" && !event.defaultPrevented) clear();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clear, hasSelection]);

  return { selectedIds, toggle, clear };
}
