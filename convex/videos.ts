import { v, ConvexError } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canTeamMemberAccessVideoWithGrantSet,
  identityEmail,
  identityName,
  requireProjectAccess,
  requireVideoManagementAccess,
  requireVideoAccess,
  resolveVideoAccessMode,
} from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { generateUniqueToken } from "./security";
import { resolveActiveShareGrant } from "./shareAccess";
import { assertTeamCanStoreBytes } from "./billingHelpers";
import {
  getGrantedVideoIdsForTeamUser,
  getVideoMemberGrantsForVideo,
  insertVideoMemberGrantRows,
  type VideoMemberGrantRow,
} from "./videoMemberGrantHelpers";
import {
  LIST_ITEM_CAP,
  capRawPage,
  capScannedCount,
  collectAccessibleVideosForProjectUpToCap,
  logCappedList,
} from "./listCaps";
import {
  classifyUploadCompletionAttempt,
  classifyUploadFailureAttempt,
  doesUploadReferenceMatch,
  getNextUploadGeneration,
  getUploadCleanupTargets,
  STALE_UPLOAD_OBJECT_CLEANUP_DELAY_MS,
} from "./uploadSessions";

const visibilityValidator = v.union(v.literal("public"), v.literal("private"));
const accessModeValidator = v.union(v.literal("team"), v.literal("restricted"));
// Keep in sync with PROJECT_VIDEO_SORTS in app/routes/dashboard/-project.data.ts.
const videoSortValidator = v.union(
  v.literal("recent"),
  v.literal("title-asc"),
  v.literal("title-desc"),
);

export const MAX_VIDEO_STACK_SIZE = 100;
const VIDEO_STACK_LIMIT_ERROR = `A video can have at most ${MAX_VIDEO_STACK_SIZE} versions.`;
const VIDEO_STACK_HEAD_ERROR =
  "A video version stack must have exactly one latest version.";
const VIDEO_STACK_CHAIN_ERROR =
  "A video version stack must be one connected acyclic chain within a single project.";
const VIDEO_STACK_PROJECT_ERROR =
  "All versions of a video must belong to the same project";

/**
 * Dependent documents removed per self-rescheduling delete batch (upstream
 * 0dfb0d1). Small on purpose: every batch is one transaction, and the
 * continuation is scheduled after each one.
 */
const VIDEO_DEPENDENT_DELETE_BATCH_DOCS = 8;

type StackReadCtx = Pick<QueryCtx, "db">;

// ---------------------------------------------------------------------------
// Pure version-stack logic. Everything above the database lives here so the
// chain invariants, renumbering, and inheritance rules stay unit-testable
// (convex/videoStacks.test.ts).
// ---------------------------------------------------------------------------

/** The stack-relevant slice of a videos row. */
export type VersionStackMember = Pick<
  Doc<"videos">,
  "_id" | "projectId" | "versionStackId" | "versionNumber" | "supersededByVideoId"
>;

export type VersionChainResult<T extends VersionStackMember> =
  | {
      ok: false;
      code: "chain" | "head" | "project" | "size";
      message: string;
    }
  | {
      ok: true;
      oldestToNewest: T[];
      head: T;
    };

/** A video without stack fields is an implicit v1; its number defaults to 1. */
export function normalizeVersionNumber(
  video: Pick<Doc<"videos">, "versionNumber">,
): number {
  return video.versionNumber ?? 1;
}

/** The head of a stack is the version nothing supersedes; standalone videos are their own head. */
export function isStackHead(
  video: Pick<Doc<"videos">, "supersededByVideoId">,
): boolean {
  return video.supersededByVideoId === undefined;
}

/**
 * Pure port of upstream 0dfb0d1's chain validation: a stack must be one
 * connected acyclic chain with exactly one root, exactly one head, and every
 * version in the same project. `video` must appear in `stackRows` unless it
 * carries no stack fields yet (implicit v1).
 */
export function validateVersionStackChain<T extends VersionStackMember>(
  video: T,
  stackRows: ReadonlyArray<T>,
  options?: { maxSize?: number },
): VersionChainResult<T> {
  const maxSize = options?.maxSize ?? MAX_VIDEO_STACK_SIZE;

  if (!video.versionStackId) {
    if (video.supersededByVideoId !== undefined) {
      return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
    }
    return { ok: true, oldestToNewest: [video], head: video };
  }

  if (stackRows.length > maxSize) {
    return {
      ok: false,
      code: "size",
      message: `A video can have at most ${maxSize} versions.`,
    };
  }
  if (!stackRows.some((row) => row._id === video._id)) {
    return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
  }
  if (!stackRows.every((row) => row.projectId === video.projectId)) {
    return { ok: false, code: "project", message: VIDEO_STACK_PROJECT_ERROR };
  }

  const heads = stackRows.filter((row) => isStackHead(row));
  if (heads.length !== 1) {
    return { ok: false, code: "head", message: VIDEO_STACK_HEAD_ERROR };
  }

  const byId = new Map(stackRows.map((row) => [row._id, row] as const));
  const predecessorCounts = new Map<Id<"videos">, number>(
    stackRows.map((row) => [row._id, 0]),
  );

  for (const row of stackRows) {
    if (!row.supersededByVideoId) continue;
    const predecessor = byId.get(row.supersededByVideoId);
    if (!predecessor) {
      return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
    }
    const predecessorCount = predecessorCounts.get(row.supersededByVideoId);
    if (predecessorCount === undefined || predecessorCount > 0) {
      // Two versions claim the same predecessor: the chain forked.
      return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
    }
    predecessorCounts.set(row.supersededByVideoId, predecessorCount + 1);
  }

  const roots = stackRows.filter(
    (row) => predecessorCounts.get(row._id) === 0,
  );
  if (roots.length !== 1) {
    return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
  }

  const oldestToNewest: T[] = [];
  const visited = new Set<Id<"videos">>();
  let current: T | undefined = roots[0];
  while (current) {
    if (visited.has(current._id)) {
      return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
    }
    visited.add(current._id);
    oldestToNewest.push(current);
    current = current.supersededByVideoId
      ? byId.get(current.supersededByVideoId)
      : undefined;
  }

  if (
    oldestToNewest.length !== stackRows.length ||
    oldestToNewest[oldestToNewest.length - 1]?._id !== heads[0]._id
  ) {
    return { ok: false, code: "chain", message: VIDEO_STACK_CHAIN_ERROR };
  }

  return { ok: true, oldestToNewest, head: heads[0] };
}

/**
 * Pure. Given stack versions newest-first (the `videos.listVersions` order),
 * pick where the client should land after `deletingVideoId` disappears: the
 * newer survivor when one exists, else the older survivor, else null. Mirrors
 * the server's replacement choice so a navigating client and the renumbered
 * stack agree (upstream 9a2c070's src/lib/videoVersionDeletion.ts).
 */
export function findPreferredReplacementVideoId(
  versions: ReadonlyArray<{ _id: Id<"videos"> }> | undefined,
  deletingVideoId: Id<"videos">,
): Id<"videos"> | null {
  const deletingIndex =
    versions?.findIndex((version) => version._id === deletingVideoId) ?? -1;
  if (deletingIndex === -1 || !versions) return null;

  return (
    versions[deletingIndex - 1]?._id ?? versions[deletingIndex + 1]?._id ?? null
  );
}

/** Patches that restore 1..n numbering and chain links after a deletion. */
export type StackRenumberPlan = {
  replacementVideoId: Id<"videos"> | null;
  survivorPatches: Array<{
    _id: Id<"videos">;
    versionNumber: number;
    supersededByVideoId: Id<"videos"> | undefined;
  }>;
};

/**
 * Pure renumbering plan (upstream 0dfb0d1's deleteVersionAndRenumberStack):
 * survivors close ranks — versions renumber 1..n oldest to newest and each
 * points at the next survivor. The replacement prefers the newer survivor so
 * viewers of the deleted version land on the most recent cut.
 */
export function planStackRenumber<T extends VersionStackMember>(
  oldestToNewest: ReadonlyArray<T>,
  deletingVideoId: Id<"videos">,
): StackRenumberPlan {
  const survivors = oldestToNewest.filter(
    (version) => version._id !== deletingVideoId,
  );
  const replacementVideoId = findPreferredReplacementVideoId(
    [...oldestToNewest].reverse(),
    deletingVideoId,
  );

  return {
    replacementVideoId,
    survivorPatches: survivors.map((survivor, index) => ({
      _id: survivor._id,
      versionNumber: index + 1,
      supersededByVideoId: survivors[index + 1]?._id,
    })),
  };
}

/** An older version of the stack, with the grantee set the planner checks against. */
export type OlderStackVersion = {
  _id: Id<"videos">;
  uploadedByClerkId: string;
  granteeClerkIds: ReadonlyArray<string>;
};

/** A backfilled grant plus the version it lands on. */
export type ReciprocalVersionGrant = {
  videoId: Id<"videos">;
  row: VideoMemberGrantRow;
};

/**
 * Pure. Grants a new version inherits from the head it replaces: the head's
 * grant rows are copied verbatim (grantedByClerkId records who shared, and
 * the copy is inheritance, not a new sharing decision). When the head is
 * restricted and a different teammate cuts the new version, the head's
 * uploader would otherwise lose access to their own video's next cut — the
 * uploader identity check is per row — so a grant is synthesized for them.
 *
 * The model is reciprocal: the creator also receives a grant on every older
 * version of the stack they cannot already access (they uploaded neither that
 * version nor hold a grant on it). Without the reciprocal rows, a teammate or
 * admin who cuts v2 of a restricted stack could never view v1 and the version
 * selector would dead-end on videos.get FORBIDDEN.
 */
export function planInheritedVersionGrants(args: {
  head: Pick<Doc<"videos">, "_id" | "accessMode" | "uploadedByClerkId">;
  headGrants: ReadonlyArray<VideoMemberGrantRow>;
  creatorClerkId: string;
  teamId: Id<"teams">;
  olderVersions: ReadonlyArray<OlderStackVersion>;
}): {
  newVersionRows: VideoMemberGrantRow[];
  olderVersionRows: ReciprocalVersionGrant[];
} {
  const newVersionRows: VideoMemberGrantRow[] = args.headGrants.map(
    (grant) => ({
      teamId: grant.teamId,
      userClerkId: grant.userClerkId,
      grantedByClerkId: grant.grantedByClerkId,
    }),
  );

  if (
    resolveVideoAccessMode(args.head) === "restricted" &&
    args.head.uploadedByClerkId !== args.creatorClerkId &&
    !args.headGrants.some(
      (grant) => grant.userClerkId === args.head.uploadedByClerkId,
    )
  ) {
    newVersionRows.push({
      teamId: args.teamId,
      userClerkId: args.head.uploadedByClerkId,
      grantedByClerkId: args.creatorClerkId,
    });
  }

  const olderVersionRows: ReciprocalVersionGrant[] = [];
  if (resolveVideoAccessMode(args.head) === "restricted") {
    const headAsOlderVersion: OlderStackVersion = {
      _id: args.head._id,
      uploadedByClerkId: args.head.uploadedByClerkId,
      granteeClerkIds: args.headGrants.map((grant) => grant.userClerkId),
    };
    for (const version of [headAsOlderVersion, ...args.olderVersions]) {
      if (
        version.uploadedByClerkId === args.creatorClerkId ||
        version.granteeClerkIds.includes(args.creatorClerkId)
      ) {
        // Idempotent: the creator can already access this version.
        continue;
      }
      olderVersionRows.push({
        videoId: version._id,
        row: {
          teamId: args.teamId,
          userClerkId: args.creatorClerkId,
          grantedByClerkId: args.creatorClerkId,
        },
      });
    }
  }

  return { newVersionRows, olderVersionRows };
}

export type ShareLinkHeadChangePlan =
  | { action: "repoint"; videoId: Id<"videos"> }
  | { action: "delete" }
  | { action: "keep" };

/**
 * Pure decision table for the invariant "shareLinks.videoId always equals the
 * current stack head". When the head changes (`changedVideoId`), links on it
 * follow the new head so old tokens keep resolving; when the last version of
 * a stack dies there is no head to follow and the links are deleted with it.
 * Links elsewhere are untouched (they cannot point at a non-head).
 */
export function planShareLinkHeadChange(args: {
  linkVideoId: Id<"videos">;
  changedVideoId: Id<"videos">;
  newHeadVideoId: Id<"videos"> | null;
}): ShareLinkHeadChangePlan {
  if (args.linkVideoId !== args.changedVideoId) {
    return { action: "keep" };
  }
  return args.newHeadVideoId
    ? { action: "repoint", videoId: args.newHeadVideoId }
    : { action: "delete" };
}

export type ShareLinkReadyRepointPlan = {
  toVideoId: Id<"videos">;
  fromVideoIds: Id<"videos">[];
};

/**
 * Pure decision table for the invariant "shareLinks.videoId always equals the
 * current READY head". A new version does not move links when it is cut — it
 * is still uploading, and the links keep serving the previous ready head. The
 * links move exactly when the new version becomes ready and is the stack
 * head: every link waiting on any older version of the stack follows it. A
 * superseded version that finishes late must not steal links from the head,
 * and a version that fails or rolls back never moves them, so the plan is
 * null in every one of those cases.
 */
export function planShareLinkRepointOnReady(args: {
  readyVideo: Pick<
    Doc<"videos">,
    "_id" | "versionStackId" | "supersededByVideoId"
  >;
  stackRows: ReadonlyArray<Pick<Doc<"videos">, "_id">>;
}): ShareLinkReadyRepointPlan | null {
  if (!args.readyVideo.versionStackId || !isStackHead(args.readyVideo)) {
    return null;
  }

  return {
    toVideoId: args.readyVideo._id,
    fromVideoIds: args.stackRows
      .filter((row) => row._id !== args.readyVideo._id)
      .map((row) => row._id),
  };
}

/**
 * Pure. A version row that never ingested an asset (no muxAssetId, never
 * ready) is rolled back — deleted with the stack renumbered — instead of
 * failing in place: a failed head would strand every share link repointed to
 * it. v1 rows never roll back; they carry the stack identity (upstream
 * c08ca53's failOrRollbackUpload condition).
 */
export function shouldRollbackAbandonedVersionRow(
  video: Pick<
    Doc<"videos">,
    "versionStackId" | "versionNumber" | "status" | "muxAssetId"
  >,
): boolean {
  return (
    video.versionStackId !== undefined &&
    video.versionNumber !== undefined &&
    video.status !== "ready" &&
    !video.muxAssetId
  );
}

/**
 * Pure. The videos.list ACL filter applied to stack versions: team-mode
 * versions pass for every teammate, restricted versions pass only for their
 * uploader or a grant holder. listVersions checks access on the requested
 * version only, so it runs the siblings through this filter and drops the
 * ones the caller cannot access.
 */
export function filterAccessibleStackVersions<
  T extends Pick<Doc<"videos">, "_id" | "accessMode" | "uploadedByClerkId">,
>(versions: ReadonlyArray<T>, args: {
  grantedVideoIds?: ReadonlySet<Id<"videos">>;
  membership: Pick<Doc<"teamMembers">, "userClerkId">;
}): T[] {
  return versions.filter((version) =>
    canTeamMemberAccessVideoWithGrantSet({
      grantedVideoIds: args.grantedVideoIds,
      membership: args.membership,
      video: version,
    }),
  );
}

// ---------------------------------------------------------------------------
// Stack helpers that touch the database.
// ---------------------------------------------------------------------------

async function getOrderedStackVersions<T extends StackReadCtx>(
  ctx: T,
  video: Doc<"videos">,
): Promise<{
  oldestToNewest: Doc<"videos">[];
  head: Doc<"videos">;
}> {
  let stackRows: Doc<"videos">[];
  if (!video.versionStackId) {
    stackRows = [video];
  } else {
    // take(cap + 1) bounds the read; the validator flags an over-size stack.
    stackRows = await ctx.db
      .query("videos")
      .withIndex("by_version_stack_id_and_version_number", (q) =>
        q.eq("versionStackId", video.versionStackId as Id<"videos">),
      )
      .take(MAX_VIDEO_STACK_SIZE + 1);
  }

  const result = validateVersionStackChain(video, stackRows);
  if (result.ok === false) {
    // Invariant corruption, not a user error: fail loudly like upstream.
    throw new Error(result.message);
  }
  return { oldestToNewest: result.oldestToNewest, head: result.head };
}

/**
 * Resolve any version of a stack to every version of that stack, oldest to
 * newest. Returns null when the video is gone. Share-link management reads
 * and guards stack-wide: while a new head uploads, grants and links can sit
 * on any version of the stack.
 */
export async function resolveStackVersions(
  ctx: StackReadCtx,
  videoId: Id<"videos">,
): Promise<Doc<"videos">[] | null> {
  const video = await ctx.db.get(videoId);
  if (!video) {
    return null;
  }
  const { oldestToNewest } = await getOrderedStackVersions(ctx, video);
  return oldestToNewest;
}

async function repointShareLinksToNewHead(
  ctx: MutationCtx,
  args: {
    changedVideoId: Id<"videos">;
    newHeadVideoId: Id<"videos"> | null;
  },
) {
  const links = await ctx.db
    .query("shareLinks")
    .withIndex("by_video", (q) => q.eq("videoId", args.changedVideoId))
    .collect();

  for (const link of links) {
    const plan = planShareLinkHeadChange({
      linkVideoId: link.videoId,
      changedVideoId: args.changedVideoId,
      newHeadVideoId: args.newHeadVideoId,
    });
    if (plan.action === "repoint") {
      // Tokens, passwords, view counts, and access grants are keyed by the
      // link row itself, so patching videoId keeps every issued token valid.
      await ctx.db.patch(link._id, { videoId: plan.videoId });
    }
    // "delete" plans leave the link in place here; the batched dependent
    // cleanup below removes links (and their access grants) once the batch
    // reaches them.
  }
}

/**
 * Remove one version: schedule per-version asset cleanup (s3 keys and Mux
 * assets are per videoId), renumber the survivors, repoint share links to
 * the new head, and delete the row. Dependents are cleaned up separately by
 * `deleteVideoDependentsBatch` so a video with thousands of comments deletes
 * in bounded transactions (upstream 0dfb0d1/f9ba0e2).
 */
/**
 * Apply planShareLinkRepointOnReady: when a version becomes ready and is the
 * stack head, every link still waiting on an older version of the stack
 * (they kept serving it through the new head's upload) follows the ready
 * head. The bounded stack read keeps this under the per-function call limit.
 */
async function repointWaitingShareLinksOnReady(
  ctx: MutationCtx,
  readyVideo: Doc<"videos">,
) {
  if (!readyVideo.versionStackId) {
    return;
  }

  const stackRows = await ctx.db
    .query("videos")
    .withIndex("by_version_stack_id_and_version_number", (q) =>
      q.eq("versionStackId", readyVideo.versionStackId as Id<"videos">),
    )
    .take(MAX_VIDEO_STACK_SIZE + 1);

  const plan = planShareLinkRepointOnReady({ readyVideo, stackRows });
  if (!plan) {
    return;
  }

  for (const fromVideoId of plan.fromVideoIds) {
    await repointShareLinksToNewHead(ctx, {
      changedVideoId: fromVideoId,
      newHeadVideoId: plan.toVideoId,
    });
  }
}

async function removeVideoVersionInternal(
  ctx: MutationCtx,
  video: Doc<"videos">,
): Promise<{
  replacementVideoId: Id<"videos"> | null;
  cleanupScheduled: boolean;
}> {
  const { oldestToNewest } = await getOrderedStackVersions(ctx, video);
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    oldestToNewest,
    video._id,
  );

  const cleanupScheduled = Boolean(video.s3Key || video.muxAssetId);
  if (cleanupScheduled) {
    await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
      videoId: video._id,
      s3Key: video.s3Key,
      muxAssetId: video.muxAssetId,
    });
  }

  for (const patch of survivorPatches) {
    await ctx.db.patch(patch._id, {
      versionNumber: patch.versionNumber,
      supersededByVideoId: patch.supersededByVideoId,
    });
  }

  await repointShareLinksToNewHead(ctx, {
    changedVideoId: video._id,
    newHeadVideoId: replacementVideoId,
  });

  await ctx.db.delete(video._id);

  return { replacementVideoId, cleanupScheduled };
}

/**
 * Delete up to `maxDocuments` dependent rows of one video: comments,
 * reactions, watch events, member grants, then share links with their access
 * grants. The video row itself must already be gone. `done` is false when
 * more dependents remain and the caller must reschedule.
 */
async function deleteVideoDependentsBatch(
  ctx: MutationCtx,
  videoId: Id<"videos">,
  maxDocuments: number,
): Promise<{ deleted: number; done: boolean }> {
  let remaining = maxDocuments;
  let deleted = 0;

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .take(remaining);
  for (const comment of comments) {
    await ctx.db.delete(comment._id);
  }
  deleted += comments.length;
  remaining -= comments.length;
  if (remaining === 0) return { deleted, done: false };

  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .take(remaining);
  for (const reaction of reactions) {
    await ctx.db.delete(reaction._id);
  }
  deleted += reactions.length;
  remaining -= reactions.length;
  if (remaining === 0) return { deleted, done: false };

  const watchEvents = await ctx.db
    .query("videoWatchEvents")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .take(remaining);
  for (const watchEvent of watchEvents) {
    await ctx.db.delete(watchEvent._id);
  }
  deleted += watchEvents.length;
  remaining -= watchEvents.length;
  if (remaining === 0) return { deleted, done: false };

  const grants = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .take(remaining);
  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
  deleted += grants.length;
  remaining -= grants.length;
  if (remaining === 0) return { deleted, done: false };

  while (remaining > 0) {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .first();
    if (!link) {
      return { deleted, done: true };
    }

    const grants = await ctx.db
      .query("shareAccessGrants")
      .withIndex("by_share_link", (q) => q.eq("shareLinkId", link._id))
      .take(remaining);
    for (const grant of grants) {
      await ctx.db.delete(grant._id);
    }
    deleted += grants.length;
    remaining -= grants.length;
    if (remaining === 0) {
      return { deleted, done: false };
    }

    await ctx.db.delete(link._id);
    deleted++;
    remaining--;
  }

  return { deleted, done: false };
}

/**
 * Roll back or fail an upload that never produced an asset. `removedVersion`
 * is true when a never-ingested version row was removed (see
 * `shouldRollbackAbandonedVersionRow`); otherwise the row fails in place.
 */
async function failOrRollbackUpload(
  ctx: MutationCtx,
  video: Doc<"videos">,
  uploadError: string,
): Promise<{ removedVersion: boolean; cleanupScheduled: boolean }> {
  if (shouldRollbackAbandonedVersionRow(video)) {
    const { cleanupScheduled } = await removeVideoVersionInternal(ctx, video);
    const result = await deleteVideoDependentsBatch(
      ctx,
      video._id,
      VIDEO_DEPENDENT_DELETE_BATCH_DOCS,
    );
    if (!result.done) {
      await ctx.scheduler.runAfter(0, internal.videos.continueVideoDelete, {
        videoId: video._id,
      });
    }
    return { removedVersion: true, cleanupScheduled };
  }

  await ctx.db.patch(video._id, buildFailedUploadPatch(uploadError));
  return { removedVersion: false, cleanupScheduled: false };
}

async function generatePublicId(ctx: MutationCtx) {
  return await generateUniqueToken(
    32,
    async (candidate) =>
      (await ctx.db
        .query("videos")
        .withIndex("by_public_id", (q) => q.eq("publicId", candidate))
        .unique()) !== null,
    5,
  );
}

function buildClientVideoSummary(
  video: Pick<
    Doc<"videos">,
    "_id" | "title" | "description" | "duration" | "thumbnailUrl" | "accessMode"
  >,
) {
  return {
    _id: video._id,
    accessMode: resolveVideoAccessMode(video),
    title: video.title,
    description: video.description,
    duration: video.duration,
    thumbnailUrl: video.thumbnailUrl,
  };
}

function buildPlaybackTarget(
  video: Pick<
    Doc<"videos">,
    "_id" | "muxAssetId" | "muxPlaybackId" | "status" | "thumbnailUrl"
  >,
) {
  return {
    _id: video._id,
    muxAssetId: video.muxAssetId,
    muxPlaybackId: video.muxPlaybackId,
    status: video.status,
    thumbnailUrl: video.thumbnailUrl,
  };
}

async function scheduleUploadCleanup(
  ctx: MutationCtx,
  args: {
    videoId: Id<"videos">;
    reason: string;
    cleanup: ReturnType<typeof getUploadCleanupTargets>;
  },
) {
  if (!args.cleanup) {
    return false;
  }

  await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
    videoId: args.videoId,
    s3Key: args.cleanup.s3Key,
    muxAssetId: args.cleanup.muxAssetId,
    reason: args.reason,
  });

  if (args.cleanup.s3Key) {
    await ctx.scheduler.runAfter(
      STALE_UPLOAD_OBJECT_CLEANUP_DELAY_MS,
      internal.videoActions.cleanupDeletedVideoAssets,
      {
        videoId: args.videoId,
        s3Key: args.cleanup.s3Key,
        reason: `${args.reason}_delayed`,
      },
    );
  }

  return true;
}

function buildFailedUploadPatch(uploadError: string | undefined) {
  return {
    muxAssetStatus: "errored" as const,
    uploadError,
    status: "failed" as const,
    s3Key: undefined,
    muxUploadId: undefined,
    muxAssetId: undefined,
    muxPlaybackId: undefined,
    thumbnailUrl: undefined,
    duration: undefined,
  };
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    videoId: v.id("videos"),
    publicId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user, project } = await requireProjectAccess(ctx, args.projectId, "member");
    await assertTeamCanStoreBytes(ctx, project.teamId, args.fileSize ?? 0);
    const publicId = await generatePublicId(ctx);

    const videoId = await ctx.db.insert("videos", {
      projectId: args.projectId,
      uploadedByClerkId: user.subject,
      uploaderName: identityName(user),
      uploaderEmail: identityEmail(user),
      title: args.title,
      description: args.description,
      fileSize: args.fileSize,
      contentType: args.contentType,
      accessMode: "team",
      status: "uploading",
      muxAssetStatus: "preparing",
      // Legacy field kept only for schema compatibility while the feature is retired.
      workflowStatus: "review",
      visibility: "private",
      publicId,
      uploadGeneration: 0,
    });

    return { videoId, publicId };
  },
});

export const createVersion = mutation({
  args: {
    sourceVideoId: v.id("videos"),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    videoId: v.id("videos"),
    versionStackId: v.id("videos"),
    versionNumber: v.number(),
  }),
  handler: async (ctx, args) => {
    // Cutting a version is a management act on the stack — same rule as
    // sharing: the version's uploader, or an admin/owner.
    const { user, project, video } = await requireVideoManagementAccess(
      ctx,
      args.sourceVideoId,
    );

    const { oldestToNewest, head } = await getOrderedStackVersions(ctx, video);
    if (oldestToNewest.length >= MAX_VIDEO_STACK_SIZE) {
      throw new ConvexError({ code: "BAD_REQUEST", message: VIDEO_STACK_LIMIT_ERROR });
    }

    await assertTeamCanStoreBytes(ctx, project.teamId, args.fileSize ?? 0);

    const publicId = await generatePublicId(ctx);
    const versionStackId = head.versionStackId ?? head._id;
    const versionNumber = normalizeVersionNumber(head) + 1;

    // Clone the head row (upstream insertVersionRecord): the new version
    // starts as an uploading row and inherits the head's metadata and ACL.
    const videoId = await ctx.db.insert("videos", {
      projectId: head.projectId,
      uploadedByClerkId: user.subject,
      uploaderName: identityName(user),
      uploaderEmail: identityEmail(user),
      title: head.title,
      description: head.description,
      accessMode: head.accessMode,
      visibility: head.visibility,
      publicId,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
      muxAssetStatus: "preparing",
      // Legacy field kept only for schema compatibility while the feature is retired.
      workflowStatus: "review",
      uploadGeneration: 0,
      versionStackId,
      versionNumber,
    });

    // Materialize the head's own stack fields (implicit v1 has none yet) and
    // supersede it. One transaction, so readers never see two heads.
    await ctx.db.patch(head._id, {
      versionStackId,
      versionNumber: normalizeVersionNumber(head),
      supersededByVideoId: videoId,
    });

    // Grants follow the stack: every restricted-access grant is copied to
    // the new head so grant checks stay per-videoId and untouched, and the
    // creator receives a reciprocal grant on every older version they cannot
    // already access, so cutting a version never dead-ends the version
    // selector behind videos.get FORBIDDEN.
    const headGrants = await getVideoMemberGrantsForVideo(ctx, head._id);
    const olderVersions = await Promise.all(
      oldestToNewest.slice(0, -1).map(async (version) => ({
        _id: version._id,
        uploadedByClerkId: version.uploadedByClerkId,
        granteeClerkIds: (
          await getVideoMemberGrantsForVideo(ctx, version._id)
        ).map((grant) => grant.userClerkId),
      })),
    );
    const grantPlan = planInheritedVersionGrants({
      head,
      headGrants,
      creatorClerkId: user.subject,
      teamId: project.teamId,
      olderVersions,
    });
    await insertVideoMemberGrantRows(ctx, {
      videoId,
      rows: grantPlan.newVersionRows,
    });
    for (const backfill of grantPlan.olderVersionRows) {
      await insertVideoMemberGrantRows(ctx, {
        videoId: backfill.videoId,
        rows: [backfill.row],
      });
    }

    // Share links do NOT follow the stack yet: the new head is still
    // uploading, and the links keep serving the previous ready head until
    // markAsReady repoints them (planShareLinkRepointOnReady). A failed or
    // rolled-back version upload therefore never moves the links.

    return { videoId, versionStackId, versionNumber };
  },
});

export const listVersions = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video, membership, project } = await requireVideoAccess(
      ctx,
      args.videoId,
    );

    const { oldestToNewest } = await getOrderedStackVersions(ctx, video);
    // requireVideoAccess checked only the requested version. Siblings in a
    // restricted stack get the same grant-set filter as videos.list, so a
    // member granted one version cannot read another version's metadata.
    const grantedVideoIds = await getGrantedVideoIdsForTeamUser(ctx, {
      teamId: project.teamId,
      userClerkId: membership.userClerkId,
    });
    const accessible = filterAccessibleStackVersions(oldestToNewest, {
      grantedVideoIds,
      membership,
    });
    // Newest first, so clients can feed the list straight into
    // findPreferredReplacementVideoId when deleting the current version.
    return [...accessible].reverse().map((version) => ({
      _id: version._id,
      projectId: version.projectId,
      title: version.title,
      status: version.status,
      thumbnailUrl: version.thumbnailUrl,
      versionNumber: normalizeVersionNumber(version),
      isLatestVersion: isStackHead(version),
      createdAt: version._creationTime,
    }));
  },
});

export const list = query({
  args: {
    projectId: v.id("projects"),
    sort: v.optional(videoSortValidator),
  },
  handler: async (ctx, args) => {
    const { membership, project } = await requireProjectAccess(ctx, args.projectId);
    const grantedVideoIds = await getGrantedVideoIdsForTeamUser(ctx, {
      teamId: project.teamId,
      userClerkId: membership.userClerkId,
    });

    // Bounded read of stack heads only, capped AFTER the ACL filter: a
    // restricted video the caller cannot access must not consume the cap, or
    // a member with grants could see fewer (or zero) videos while accessible
    // ones sit past the first page. The paged scan collects at most
    // LIST_ITEM_CAP + 1 accessible videos and never reads more rows than the
    // unbounded .collect() it replaces. The grant set makes each ACL check a
    // pure set lookup, so filtering stays free.
    const accessible = await collectAccessibleVideosForProjectUpToCap(ctx, {
      projectId: args.projectId,
      grantedVideoIds,
      membership,
      sort: args.sort,
    });
    const { items: videos, hasMore } = capRawPage(accessible.accepted);
    if (hasMore) {
      logCappedList("videos.list", {
        projectId: args.projectId,
        kept: videos.length,
        skippedInaccessible: accessible.skippedCount,
        moreAccessibleRemain: accessible.moreRemain,
        cap: LIST_ITEM_CAP,
      });
    }

    return {
      hasMore,
      videos: await Promise.all(
      videos.map(async (video) => {
        // Per-video comment count, capped at LIST_ITEM_CAP + 1 scanned rows
        // (upstream 62c0463 pattern) so a video with thousands of comments
        // does not materialize them all just to read .length. The cap is
        // reported per item, not applied silently.
        const commentPage = await ctx.db
          .query("comments")
          .withIndex("by_video", (q) => q.eq("videoId", video._id))
          .take(LIST_ITEM_CAP + 1);
        const { count: commentCount, isCapped: commentCountIsCapped } =
          capScannedCount(commentPage.length);

        return {
          ...video,
          accessMode: resolveVideoAccessMode(video),
          uploaderName: video.uploaderName ?? "Unknown",
          commentCount,
          commentCountIsCapped,
          versionNumber: normalizeVersionNumber(video),
        };
      }),
      ),
    };
  },
});

export const get = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video, membership } = await requireVideoAccess(ctx, args.videoId);
    return {
      ...video,
      accessMode: resolveVideoAccessMode(video),
      uploaderName: video.uploaderName ?? "Unknown",
      versionNumber: normalizeVersionNumber(video),
      isLatestVersion: isStackHead(video),
      role: membership.role,
    };
  },
});

export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async () => {
    return null;
  },
});

export const getPublicIdByVideoId = query({
  args: { videoId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async () => {
    return null;
  },
});

export const getByShareGrant = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      return null;
    }

    return {
      allowDownload: resolved.shareLink.allowDownload,
      grantExpiresAt: resolved.grant.expiresAt,
      video: buildClientVideoSummary(video),
    };
  },
});

export const update = mutation({
  args: {
    videoId: v.id("videos"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");

    const updates: Partial<{ title: string; description: string }> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.videoId, updates);
  },
});

export const setVisibility = mutation({
  args: {
    videoId: v.id("videos"),
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    await requireVideoManagementAccess(ctx, args.videoId);

    await ctx.db.patch(args.videoId, {
      visibility: "private",
    });

    await ctx.scheduler.runAfter(0, internal.videoActions.syncPlaybackAccessForVideo, {
      videoId: args.videoId,
    });
  },
});

export const getAccessSettings = query({
  args: { videoId: v.id("videos") },
  returns: v.union(
    v.object({
      accessMode: accessModeValidator,
      grantedUserClerkIds: v.array(v.string()),
      teamMembers: v.array(
        v.object({
          role: v.union(
            v.literal("owner"),
            v.literal("admin"),
            v.literal("member"),
            v.literal("viewer"),
          ),
          userClerkId: v.string(),
          userName: v.string(),
        }),
      ),
      uploaderClerkId: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { video, project } = await requireVideoManagementAccess(ctx, args.videoId);
    const { oldestToNewest, head } = await getOrderedStackVersions(ctx, video);

    // Access settings are stack-wide: every version keeps its own grant
    // copies, so the dialog shows the union across the whole stack. The head
    // is the canonical row for accessMode and uploader identity.
    const [teamMembers, grantsPerVersion] = await Promise.all([
      ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", project.teamId))
        .collect(),
      Promise.all(
        oldestToNewest.map((version) =>
          getVideoMemberGrantsForVideo(ctx, version._id),
        ),
      ),
    ]);
    const grantedUserClerkIds = Array.from(
      new Set(grantsPerVersion.flat().map((grant) => grant.userClerkId)),
    );

    return {
      accessMode: resolveVideoAccessMode(head),
      grantedUserClerkIds,
      teamMembers: teamMembers
        .map((member) => ({
          role: member.role,
          userClerkId: member.userClerkId,
          userName: member.userName,
        }))
        .sort((left, right) => left.userName.localeCompare(right.userName)),
      uploaderClerkId: head.uploadedByClerkId,
    };
  },
});

/**
 * Convex caps one mutation at 1,024 document writes. A stack-wide access
 * rewrite can exceed that with an opaque error, so the write count is
 * checked before the first write.
 */
export const MAX_MUTATION_DOCUMENT_WRITES = 1_024;

/**
 * Pure. Document writes updateAccessSettings performs for a stack: per
 * version, the existing grant rows it deletes, the new grant rows it
 * inserts, and the access-mode patch.
 */
export function countAccessSettingsWrites(args: {
  existingGrantsPerVersion: ReadonlyArray<number>;
  newGranteeCount: number;
}): number {
  return args.existingGrantsPerVersion.reduce(
    (total, existingGrants) =>
      total + existingGrants + args.newGranteeCount + 1,
    0,
  );
}

export const updateAccessSettings = mutation({
  args: {
    accessMode: accessModeValidator,
    grantedUserClerkIds: v.array(v.string()),
    videoId: v.id("videos"),
  },
  handler: async (ctx, args) => {
    const { user, project, video } = await requireVideoManagementAccess(ctx, args.videoId);
    const { oldestToNewest, head } = await getOrderedStackVersions(ctx, video);

    const uniqueGrantedUserIds = Array.from(
      new Set(
        args.grantedUserClerkIds
          .map((userClerkId) => userClerkId.trim())
          .filter((userClerkId) => userClerkId.length > 0 && userClerkId !== head.uploadedByClerkId),
      ),
    );

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", project.teamId))
      .collect();
    const memberIds = new Set(memberships.map((membership) => membership.userClerkId));

    for (const userClerkId of uniqueGrantedUserIds) {
      if (!memberIds.has(userClerkId)) {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Restricted access can only be granted to existing team members." });
      }
    }

    // Pre-count the stack-wide rewrite (per version: deleted grants + inserted
    // grants + one patch) and reject before the first write. Exceeding the
    // per-mutation document-write limit mid-rewrite fails with an opaque
    // error and rolls back anyway.
    const grantsPerVersion = await Promise.all(
      oldestToNewest.map((version) => getVideoMemberGrantsForVideo(ctx, version._id)),
    );
    const plannedWrites = countAccessSettingsWrites({
      existingGrantsPerVersion: grantsPerVersion.map((grants) => grants.length),
      newGranteeCount: uniqueGrantedUserIds.length,
    });
    if (plannedWrites > MAX_MUTATION_DOCUMENT_WRITES) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Updating access across ${oldestToNewest.length} versions needs ${plannedWrites} writes, over the ${MAX_MUTATION_DOCUMENT_WRITES} one update can perform. Delete some versions first, or grant access to fewer team members.`,
      });
    }

    // Stack-wide write: superseded versions carry grant copies of their own,
    // so old versions cannot bypass the ACL after settings change.
    for (const grants of grantsPerVersion) {
      for (const grant of grants) {
        await ctx.db.delete(grant._id);
      }
    }

    for (const version of oldestToNewest) {
      await insertVideoMemberGrantRows(ctx, {
        videoId: version._id,
        rows: uniqueGrantedUserIds.map((userClerkId) => ({
          teamId: project.teamId,
          userClerkId,
          grantedByClerkId: user.subject,
        })),
      });

      await ctx.db.patch(version._id, {
        accessMode: args.accessMode,
        visibility: "private",
      });
    }

    // Refresh signed playback for versions that have an asset but no stored
    // playback id; ready versions already hold one and skip the action.
    for (const version of oldestToNewest) {
      if (version.muxAssetId && !version.muxPlaybackId) {
        await ctx.scheduler.runAfter(0, internal.videoActions.syncPlaybackAccessForVideo, {
          videoId: version._id,
        });
      }
    }
  },
});

export const remove = mutation({
  args: { videoId: v.id("videos") },
  returns: v.object({
    replacementVideoId: v.union(v.id("videos"), v.null()),
  }),
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "admin");

    // One unified delete path (upstream 0dfb0d1/9a2c070 plus our cascade):
    // the version row disappears now — renumbered survivors and repointed
    // share links are visible atomically — while dependent rows (comments,
    // reactions, watch events, grants, share links whose stack died) drain
    // in bounded self-rescheduling batches.
    const { replacementVideoId } = await removeVideoVersionInternal(ctx, video);
    const result = await deleteVideoDependentsBatch(
      ctx,
      args.videoId,
      VIDEO_DEPENDENT_DELETE_BATCH_DOCS,
    );
    if (!result.done) {
      await ctx.scheduler.runAfter(0, internal.videos.continueVideoDelete, {
        videoId: args.videoId,
      });
    }

    return { replacementVideoId };
  },
});

export const continueVideoDelete = internalMutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    // A queued job may find the version row still present (a job scheduled
    // before the row's removal, upstream f9ba0e2): finish that removal first,
    // then drain the dependents.
    const existingVideo = await ctx.db.get(args.videoId);
    if (existingVideo) {
      await removeVideoVersionInternal(ctx, existingVideo);
    }

    const result = await deleteVideoDependentsBatch(
      ctx,
      args.videoId,
      VIDEO_DEPENDENT_DELETE_BATCH_DOCS,
    );
    if (!result.done) {
      await ctx.scheduler.runAfter(0, internal.videos.continueVideoDelete, args);
    }
  },
});

/**
 * Pure. finalizeAbandonedUpload's guard, the same classification
 * markAsFailed runs: only an "apply" decision may fail or roll back the row.
 * The sweeper carries no session token of its own, so legacy rows without
 * one are the only sessions it can claim — every token-bearing row reads as
 * stale, and ready, processing-protected, and already-failed rows (including
 * ready videos) are never patched.
 */
export function shouldFinalizeAbandonedUpload(
  video: Pick<
    Doc<"videos">,
    "status" | "uploadSessionToken" | "s3Key" | "muxAssetId"
  >,
): boolean {
  return (
    classifyUploadFailureAttempt(video, {
      allowProcessingFailure: true,
      allowLegacyWithoutSession: true,
    }).kind === "apply"
  );
}

export const finalizeAbandonedUpload = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadError: v.string(),
  },
  returns: v.object({
    removedVersion: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      return { removedVersion: true };
    }

    // Same classification guard as markAsFailed: without it a stale or
    // already-settled row (including a ready video) would be patched or
    // rolled back by a late sweep.
    if (!shouldFinalizeAbandonedUpload(video)) {
      return { removedVersion: false };
    }

    const { removedVersion } = await failOrRollbackUpload(
      ctx,
      video,
      args.uploadError,
    );
    return { removedVersion };
  },
});

export const setUploadInfo = internalMutation({
  args: {
    videoId: v.id("videos"),
    s3Key: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
    uploadSessionToken: v.string(),
  },
  handler: async (ctx, args): Promise<{
    cleanupScheduled: boolean;
    uploadGeneration: number;
  }> => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    if (video.status === "ready") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Ready videos cannot be replaced through the upload pipeline." });
    }

    const cleanup = getUploadCleanupTargets(video);
    const cleanupScheduled = await scheduleUploadCleanup(ctx, {
      videoId: args.videoId,
      cleanup,
      reason: "superseded_upload_session",
    });
    const uploadGeneration = getNextUploadGeneration(video.uploadGeneration);

    await ctx.db.patch(args.videoId, {
      s3Key: args.s3Key,
      muxUploadId: undefined,
      muxAssetId: undefined,
      muxPlaybackId: undefined,
      muxAssetStatus: "preparing",
      thumbnailUrl: undefined,
      duration: undefined,
      uploadError: undefined,
      fileSize: args.fileSize,
      contentType: args.contentType,
      status: "uploading",
      uploadGeneration,
      uploadSessionToken: args.uploadSessionToken,
    });

    return {
      cleanupScheduled,
      uploadGeneration,
    };
  },
});

export const reconcileUploadedObjectMetadata = internalMutation({
  args: {
    videoId: v.id("videos"),
    fileSize: v.number(),
    contentType: v.string(),
    uploadSessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ applied: boolean }> => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const matchesCurrentUpload = doesUploadReferenceMatch(video, {
      uploadSessionToken: args.uploadSessionToken,
      allowLegacyWithoutSession: args.uploadSessionToken === undefined,
    });
    if (!matchesCurrentUpload) {
      return { applied: false };
    }

    const project = await ctx.db.get(video.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const declaredSize =
      typeof video.fileSize === "number" && Number.isFinite(video.fileSize)
        ? Math.max(0, video.fileSize)
        : 0;
    const actualSize = Number.isFinite(args.fileSize) ? Math.max(0, args.fileSize) : 0;
    const sizeDelta = actualSize - declaredSize;

    if (sizeDelta > 0) {
      await assertTeamCanStoreBytes(ctx, project.teamId, sizeDelta);
    }

    await ctx.db.patch(args.videoId, {
      fileSize: actualSize,
      contentType: args.contentType,
    });

    return { applied: true };
  },
});

export const markAsProcessing = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        outcome:
          | "stale"
          | "missing_object"
          | "already_processing"
          | "already_ready"
          | "retry_required";
      }
    | {
        outcome: "started";
        contentType?: string;
        s3Key: string;
        uploadGeneration: number;
      }
  > => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      return { outcome: "stale" };
    }

    const decision = classifyUploadCompletionAttempt(video, args.uploadSessionToken);
    switch (decision.kind) {
      case "start_ingest":
        await ctx.db.patch(args.videoId, {
          status: "processing",
          muxAssetStatus: "preparing",
          uploadError: undefined,
        });
        return {
          outcome: "started",
          contentType: video.contentType,
          s3Key: decision.s3Key,
          uploadGeneration: video.uploadGeneration ?? 0,
        };
      default:
        return { outcome: decision.kind };
    }
  },
});

export const markAsReady = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.optional(v.string()),
    muxAssetId: v.string(),
    muxPlaybackId: v.string(),
    duration: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    allowLegacyWithoutSession: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ applied: boolean }> => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      return { applied: false };
    }

    const matchesCurrentUpload = doesUploadReferenceMatch(video, {
      uploadSessionToken: args.uploadSessionToken,
      muxAssetId: args.muxAssetId,
      allowLegacyWithoutSession: args.allowLegacyWithoutSession,
    });
    if (!matchesCurrentUpload || video.status === "failed") {
      return { applied: false };
    }

    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxPlaybackId: args.muxPlaybackId,
      muxAssetStatus: "ready",
      duration: args.duration,
      thumbnailUrl: args.thumbnailUrl,
      uploadError: undefined,
      status: "ready",
    });

    // Share links follow the head exactly now: the new version is ready, so
    // every link that kept serving the previous ready head through the
    // upload repoints here (planShareLinkRepointOnReady).
    await repointWaitingShareLinksOnReady(ctx, video);

    return { applied: true };
  },
});

export const markAsFailed = internalMutation({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    uploadError: v.optional(v.string()),
    allowProcessingFailure: v.optional(v.boolean()),
    allowLegacyWithoutSession: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    cleanupScheduled: boolean;
    outcome: "stale" | "ignored" | "already_failed" | "applied";
  }> => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      return { cleanupScheduled: false, outcome: "stale" };
    }

    const decision = classifyUploadFailureAttempt(video, {
      uploadSessionToken: args.uploadSessionToken,
      muxAssetId: args.muxAssetId,
      allowProcessingFailure: args.allowProcessingFailure ?? false,
      allowLegacyWithoutSession: args.allowLegacyWithoutSession,
    });
    if (decision.kind === "stale" || decision.kind === "ignored") {
      return { cleanupScheduled: false, outcome: decision.kind };
    }

    if (decision.kind === "already_failed") {
      return { cleanupScheduled: false, outcome: "already_failed" };
    }

    // A never-ingested version row rolls back instead of failing in place:
    // a failed head would strand the share links repointed to it
    // (upstream failOrRollbackUpload, c08ca53/0dfb0d1).
    if (shouldRollbackAbandonedVersionRow(video)) {
      const { cleanupScheduled } = await failOrRollbackUpload(
        ctx,
        video,
        args.uploadError ?? "Upload failed.",
      );
      return { cleanupScheduled, outcome: "applied" };
    }

    await ctx.db.patch(args.videoId, buildFailedUploadPatch(args.uploadError));
    const cleanupScheduled = await scheduleUploadCleanup(ctx, {
      videoId: args.videoId,
      cleanup: decision.cleanup,
      reason: "failed_upload_session",
    });

    return {
      cleanupScheduled,
      outcome: "applied",
    };
  },
});

export const setMuxAssetReference = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxAssetId: v.string(),
    uploadSessionToken: v.optional(v.string()),
    allowLegacyWithoutSession: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ applied: boolean }> => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      return { applied: false };
    }

    const matchesCurrentUpload = doesUploadReferenceMatch(video, {
      uploadSessionToken: args.uploadSessionToken,
      muxAssetId: args.muxAssetId,
      allowLegacyWithoutSession: args.allowLegacyWithoutSession,
    });
    if (!matchesCurrentUpload || video.status === "failed") {
      return { applied: false };
    }

    await ctx.db.patch(args.videoId, {
      muxAssetId: args.muxAssetId,
      muxAssetStatus: "preparing",
      status: "processing",
    });

    return { applied: true };
  },
});

export const setMuxPlaybackId = internalMutation({
  args: {
    videoId: v.id("videos"),
    muxPlaybackId: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: {
      muxPlaybackId: string;
      thumbnailUrl?: string;
    } = {
      muxPlaybackId: args.muxPlaybackId,
    };

    if (args.thumbnailUrl !== undefined) {
      updates.thumbnailUrl = args.thumbnailUrl;
    }

    await ctx.db.patch(args.videoId, updates);
  },
});

export const setThumbnailUrl = internalMutation({
  args: {
    videoId: v.id("videos"),
    thumbnailUrl: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, {
      thumbnailUrl: args.thumbnailUrl ?? undefined,
    });
  },
});

export const getVideoByMuxUploadId = internalQuery({
  args: {
    muxUploadId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_upload_id", (q) => q.eq("muxUploadId", args.muxUploadId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoByMuxAssetId = internalQuery({
  args: {
    muxAssetId: v.string(),
  },
  returns: v.union(
    v.object({
      videoId: v.id("videos"),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ videoId: Id<"videos"> } | null> => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_mux_asset_id", (q) => q.eq("muxAssetId", args.muxAssetId))
      .unique();

    if (!video) return null;
    return { videoId: video._id };
  },
});

export const getVideoForPlayback = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "viewer");
    return video;
  },
});

export const getPlaybackTargetById = internalQuery({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) return null;
    return buildPlaybackTarget(video);
  },
});

export const listPlaybackTargetsForProject = query({
  args: {
    projectId: v.id("projects"),
    videoIds: v.optional(v.array(v.id("videos"))),
  },
  handler: async (ctx, args) => {
    const { membership, project } = await requireProjectAccess(ctx, args.projectId, "viewer");
    const grantedVideoIds = await getGrantedVideoIdsForTeamUser(ctx, {
      teamId: project.teamId,
      userClerkId: membership.userClerkId,
    });

    if (args.videoIds) {
      // Explicit request: the request length itself bounds the read (one get
      // per unique id), so no additional cap applies here — capping would
      // drop playback targets the caller explicitly asked for. Project
      // scoping and the ACL are still enforced per id, and the result keeps
      // request order.
      const targets = [];
      for (const videoId of new Set(args.videoIds)) {
        const video = await ctx.db.get(videoId);
        if (!video || video.projectId !== args.projectId) {
          continue;
        }

        const canAccess = canTeamMemberAccessVideoWithGrantSet({
          grantedVideoIds,
          membership,
          video,
        });
        if (!canAccess) {
          continue;
        }

        targets.push(buildPlaybackTarget(video));
      }

      return targets;
    }

    // No explicit request: same bounded read as videos.list, capped AFTER the
    // ACL filter so restricted videos do not consume the cap. Targets beyond
    // the cap are logged, never dropped silently.
    const accessible = await collectAccessibleVideosForProjectUpToCap(ctx, {
      projectId: args.projectId,
      grantedVideoIds,
      membership,
    });
    const { items, hasMore } = capRawPage(accessible.accepted);
    if (hasMore) {
      logCappedList("videos.listPlaybackTargetsForProject", {
        projectId: args.projectId,
        kept: items.length,
        skippedInaccessible: accessible.skippedCount,
        moreAccessibleRemain: accessible.moreRemain,
        cap: LIST_ITEM_CAP,
      });
    }

    return items.map((video) => buildPlaybackTarget(video));
  },
});

export const getPublicPlaybackTarget = internalQuery({
  args: { publicId: v.string() },
  handler: async () => {
    return null;
  },
});

export const getShareGrantPlaybackTarget = internalQuery({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      return null;
    }

    return buildPlaybackTarget(video);
  },
});

export const getShareGrantDownloadTarget = internalQuery({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) {
      return null;
    }

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video) {
      return null;
    }

    return {
      _id: video._id,
      allowDownload: resolved.shareLink.allowDownload,
      contentType: video.contentType,
      s3Key: video.s3Key,
      status: video.status,
      title: video.title,
    };
  },
});

export const updateDuration = mutation({
  args: {
    videoId: v.id("videos"),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "member");
    await ctx.db.patch(args.videoId, { duration: args.duration });
  },
});

// ---------------------------------------------------------------------------
// Bulk mutations (upstream 69b3cec + fixes da236dc, dcc64b8). Append-only:
// the stack machinery above stays untouched. Every bulk mutation runs each id
// through the same guards as its single-item counterpart, so a failure on any
// id rolls back the whole call — one mutation is one transaction.
// ---------------------------------------------------------------------------

const workflowStatusValidator = v.union(
  v.literal("review"),
  v.literal("rework"),
  v.literal("done"),
);

/** Ids accepted per bulk mutation call (upstream MAX_BULK_VIDEO_ACTION). */
export const MAX_BULK_VIDEO_ACTION = 100;
/**
 * Total versions one bulk delete may remove (upstream da236dc/dcc64b8).
 * Checked after the stacks are collected and before anything is deleted.
 * Sized so the worst-case database calls of the single removeMany
 * transaction stay under Convex's per-function limit with headroom — the
 * in-transaction dependent drain costs far more per version than the
 * collection pass (see countBulkDeleteDbCalls, pinned in
 * convex/videoBulkActions.test.ts).
 */
export const MAX_BULK_DELETE_VERSIONS = 100;
/** Convex caps one function at 4,096 database calls (reads and writes). */
export const MAX_BULK_DELETE_DB_CALLS = 4_096;
/**
 * Worst-case database calls per removed version inside the removeMany
 * transaction: the dependent-drain batch issues at most 20 range queries
 * (four fixed lookups, then a link and a grant lookup per remaining share
 * link), at most 8 dependent deletes plus the version row delete, and at
 * most two scheduled jobs (asset cleanup and a drain continuation).
 */
export const BULK_DELETE_DB_CALLS_PER_VERSION = 31;
/**
 * Worst-case database calls per selected id in removeMany's collection pass:
 * the access check (video, project, membership, grant fallback) plus the
 * stack read.
 */
export const BULK_DELETE_DB_CALLS_PER_SELECTED_ID = 6;
/**
 * Convex caps one mutation at 1,000 scheduled jobs, and each removed version
 * can need two (asset cleanup plus a dependent-drain continuation), so a
 * pathological batch can outgrow the version cap. Job counting turns that
 * into a coded error instead of an opaque scheduler failure.
 */
export const MAX_BULK_DELETE_SCHEDULED_JOBS = 1_000;

const BULK_LIMIT_ERROR = `You can act on at most ${MAX_BULK_VIDEO_ACTION} videos at once.`;
const BULK_DELETE_VERSIONS_ERROR =
  "Too many versions to delete at once. Select fewer videos.";
const BULK_DELETE_JOBS_ERROR =
  "Too many scheduled jobs to delete at once. Select fewer videos.";

/**
 * Pure. Dedupes bulk ids (a selection can name several versions of one stack)
 * and enforces the per-call cap. Throws the fork's coded ConvexError shape.
 */
export function uniqueBulkVideoIds(videoIds: ReadonlyArray<Id<"videos">>) {
  if (videoIds.length > MAX_BULK_VIDEO_ACTION) {
    throw new ConvexError({ code: "BAD_REQUEST", message: BULK_LIMIT_ERROR });
  }
  return [...new Set(videoIds)];
}

/**
 * Pure. Worst-case database calls one removeMany call issues: per selected
 * id the access check plus the stack read, and per collected version the
 * row delete, the dependent-drain batch, and its scheduled jobs.
 */
export function countBulkDeleteDbCalls(args: {
  selectedIds: number;
  versions: number;
}): number {
  return (
    args.selectedIds * BULK_DELETE_DB_CALLS_PER_SELECTED_ID +
    args.versions * BULK_DELETE_DB_CALLS_PER_VERSION
  );
}

/**
 * Pure. Worst-case scheduled jobs one removeMany call creates: one asset
 * cleanup per version with stored objects, plus at most one dependent-drain
 * continuation per version.
 */
export function countBulkDeleteScheduledJobs(args: {
  versions: number;
  versionsWithAssets: number;
}): number {
  return args.versionsWithAssets + args.versions;
}

/** Pure. Rejects a bulk delete whose collected version count exceeds the budget. */
export function assertBulkDeleteVersionBudget(
  count: number,
  max: number = MAX_BULK_DELETE_VERSIONS,
) {
  if (count > max) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: BULK_DELETE_VERSIONS_ERROR,
    });
  }
}

/** Pure. Rejects a bulk delete whose scheduled jobs exceed the scheduler budget. */
export function assertBulkDeleteScheduledJobBudget(
  count: number,
  max: number = MAX_BULK_DELETE_SCHEDULED_JOBS,
) {
  if (count > max) {
    throw new ConvexError({ code: "BAD_REQUEST", message: BULK_DELETE_JOBS_ERROR });
  }
}

/**
 * Move one video's whole stack to another project. Returns the ids of every
 * version in the moved stack so the caller can skip other selections from the
 * same stack. Access is checked per selected id on the source (member, grant
 * checks included), then on the destination (member); a destination in
 * another team is rejected so per-team grants, watch usage, and storage
 * accounting stay coherent.
 */
async function moveVideoStackForBulk(
  ctx: MutationCtx,
  videoId: Id<"videos">,
  projectId: Id<"projects">,
): Promise<Id<"videos">[]> {
  const { project: sourceProject, video } = await requireVideoAccess(ctx, videoId, "member");
  const { oldestToNewest } = await getOrderedStackVersions(ctx, video);
  const versionIds = oldestToNewest.map((version) => version._id);

  if (sourceProject._id === projectId) {
    return versionIds; // dropped back into the same project: no-op
  }

  const { project: destination } = await requireProjectAccess(ctx, projectId, "member");
  if (destination.teamId !== sourceProject.teamId) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Videos can only be moved to another project in the same team.",
    });
  }

  await Promise.all(versionIds.map((id) => ctx.db.patch(id, { projectId })));
  return versionIds;
}

export const moveMany = mutation({
  args: {
    videoIds: v.array(v.id("videos")),
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const handled = new Set<Id<"videos">>();
    for (const videoId of uniqueBulkVideoIds(args.videoIds)) {
      if (handled.has(videoId)) continue;
      for (const stackVideoId of await moveVideoStackForBulk(ctx, videoId, args.projectId)) {
        handled.add(stackVideoId);
      }
    }
    return null;
  },
});

export const updateWorkflowStatusMany = mutation({
  args: {
    videoIds: v.array(v.id("videos")),
    workflowStatus: workflowStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const videoId of uniqueBulkVideoIds(args.videoIds)) {
      // Same guard as videos.update: grant-checked member access per id.
      await requireVideoAccess(ctx, videoId, "member");
      await ctx.db.patch(videoId, { workflowStatus: args.workflowStatus });
    }
    return null;
  },
});

export const removeMany = mutation({
  args: { videoIds: v.array(v.id("videos")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Pass 1 (upstream dcc64b8): access-check every selection and collect the
    // whole stacks before deleting anything, so both budgets fail cleanly
    // instead of tripping a Convex limit mid-delete. Duplicates within one
    // stack are deduped by stack identity. The transaction rolls back on
    // failure either way; this only upgrades the error.
    const handledStacks = new Set<Id<"videos">>();
    const versions: Doc<"videos">[] = [];
    for (const videoId of uniqueBulkVideoIds(args.videoIds)) {
      const { video } = await requireVideoAccess(ctx, videoId, "admin");
      const stackKey = video.versionStackId ?? video._id;
      if (handledStacks.has(stackKey)) continue;
      handledStacks.add(stackKey);
      versions.push(...(await getOrderedStackVersions(ctx, video)).oldestToNewest);
    }

    // Both budgets are computed as a worst case and checked before the first
    // delete, each with its own coded message. The version cap keeps the
    // worst-case database calls under Convex's per-function limit (pinned in
    // convex/videoBulkActions.test.ts); the job budget guards the scheduler
    // limit independently, because every version with stored objects adds an
    // asset-cleanup job and every under-drained version adds a continuation.
    const versionsWithAssets = versions.filter(
      (version) => version.s3Key || version.muxAssetId,
    ).length;
    assertBulkDeleteVersionBudget(versions.length);
    assertBulkDeleteScheduledJobBudget(
      countBulkDeleteScheduledJobs({
        versions: versions.length,
        versionsWithAssets,
      }),
    );

    // Pass 2: delete every version of every collected stack. No renumbering
    // and no share-link repointing — the whole stack dies, so there is no new
    // head to renumber to; the links sit on the head and the dependent drain
    // removes them together with their access grants. Asset cleanup and the
    // batched dependent drain follow the same scheduling as `remove`.
    for (const version of versions) {
      if (version.s3Key || version.muxAssetId) {
        await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
          videoId: version._id,
          s3Key: version.s3Key,
          muxAssetId: version.muxAssetId,
        });
      }

      await ctx.db.delete(version._id);

      const drain = await deleteVideoDependentsBatch(
        ctx,
        version._id,
        VIDEO_DEPENDENT_DELETE_BATCH_DOCS,
      );
      if (!drain.done) {
        await ctx.scheduler.runAfter(0, internal.videos.continueVideoDelete, {
          videoId: version._id,
        });
      }
    }
    return null;
  },
});
