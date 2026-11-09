import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { canTeamMemberAccessVideoWithGrantSet } from "./auth";

/**
 * Bounded list reads shared by the dashboard queries.
 *
 * Upstream lawn caps list reads with the `.take(cap + 1)` pattern (62c0463)
 * and reports `*IsCapped` flags next to counts (aaf96d8). The fork also
 * filters videos through the restricted-access ACL, so caps must apply AFTER
 * that filter: a restricted video the caller cannot access must not consume
 * the cap, or a restricted-access member could see fewer (or zero) videos
 * while accessible ones sit past the first page.
 */

/** Maximum number of items a capped list query returns. */
export const LIST_ITEM_CAP = 100;

/** Anything with a `paginate` method (a chained Convex query builder). */
export interface Paginatable<T> {
  paginate(options: PaginationOptions): Promise<PaginationResult<T>>;
}

/**
 * Pure. Given a raw page read with `.take(cap + 1)`, decide what to keep.
 * `hasMore` means at least one more row existed; `droppedCount` counts only
 * the overflow rows actually read (there may be more beyond them).
 */
export function capRawPage<T>(
  page: readonly T[],
  cap: number = LIST_ITEM_CAP,
): { items: T[]; hasMore: boolean; droppedCount: number } {
  if (page.length <= cap) {
    return { items: [...page], hasMore: false, droppedCount: 0 };
  }
  return {
    items: page.slice(0, cap),
    hasMore: true,
    droppedCount: page.length - cap,
  };
}

/**
 * Pure. Given the number of rows scanned with `.take(cap + 1)`, cap a count
 * and report whether the true count is larger.
 */
export function capScannedCount(
  scanned: number,
  cap: number = LIST_ITEM_CAP,
): { count: number; isCapped: boolean } {
  return {
    count: Math.min(scanned, cap),
    isCapped: scanned > cap,
  };
}

/**
 * Page through `source` and collect accepted items until either `cap` + 1
 * items are accepted (the list is provably truncated) or the index is
 * exhausted (the list is exact). Returns up to `cap` + 1 accepted items so
 * callers can tell "exactly cap" from "more than cap" via `capRawPage` or
 * `capScannedCount`. Never reads more rows than an unbounded `.collect()`.
 */
export async function collectAcceptedUpToCap<T>(
  source: Paginatable<T>,
  args: {
    accepts: (item: T) => boolean;
    cap?: number;
    numItems?: number;
  },
): Promise<{
  accepted: T[];
  moreRemain: boolean;
  skippedCount: number;
}> {
  const cap = args.cap ?? LIST_ITEM_CAP;
  const numItems = args.numItems ?? cap + 1;
  const accepted: T[] = [];
  let skippedCount = 0;
  let cursor: string | null = null;
  let done = false;

  while (!done && accepted.length <= cap) {
    const result = await source.paginate({ numItems, cursor });
    cursor = result.continueCursor;
    done = result.isDone;
    for (const item of result.page) {
      if (accepted.length > cap) {
        // cap + 1 accepted items already prove truncation; stop reading.
        break;
      }
      if (args.accepts(item)) {
        accepted.push(item);
      } else {
        skippedCount += 1;
      }
    }
  }

  return { accepted, moreRemain: !done, skippedCount };
}

/**
 * Bounded scan of a project's videos, capped AFTER the restricted-access ACL
 * filter. `accepted` holds at most `LIST_ITEM_CAP` + 1 videos, in index order.
 * The grant set makes each ACL check a pure set lookup, so the scan adds no
 * per-video queries.
 */
export async function collectAccessibleVideosForProjectUpToCap(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    grantedVideoIds: ReadonlySet<Id<"videos">>;
    membership: Doc<"teamMembers">;
    order?: "asc" | "desc";
    cap?: number;
  },
): Promise<{
  accepted: Doc<"videos">[];
  moreRemain: boolean;
  skippedCount: number;
}> {
  const query = ctx.db
    .query("videos")
    .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    .order(args.order ?? "asc");

  return await collectAcceptedUpToCap(query, {
    cap: args.cap,
    accepts: (video) =>
      canTeamMemberAccessVideoWithGrantSet({
        grantedVideoIds: args.grantedVideoIds,
        membership: args.membership,
        video,
      }),
  });
}

/**
 * Log a truncated list read. Every cap must be reported — no silent caps.
 * Matches the `console.*` + object payload style used in muxActions.ts.
 */
export function logCappedList(site: string, details: Record<string, unknown>) {
  console.warn(`capped list read at ${site}`, details);
}
