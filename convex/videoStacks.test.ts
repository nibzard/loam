import test from "node:test";
import assert from "node:assert/strict";
import type { PaginationResult } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canTeamMemberAccessVideoWithGrantSet } from "./auth";
import {
  LIST_ITEM_CAP,
  capRawPage,
  collectAcceptedUpToCap,
  resolveProjectVideoListScan,
} from "./listCaps";
import {
  MAX_MUTATION_DOCUMENT_WRITES,
  MAX_VIDEO_STACK_SIZE,
  countAccessSettingsWrites,
  filterAccessibleStackVersions,
  findPreferredReplacementVideoId,
  isStackHead,
  normalizeVersionNumber,
  planInheritedVersionGrants,
  planShareLinkHeadChange,
  planShareLinkRepointOnReady,
  planStackRenumber,
  shouldFinalizeAbandonedUpload,
  shouldRollbackAbandonedVersionRow,
  validateVersionStackChain,
  type VersionStackMember,
} from "./videos";

const videoId = (id: string) => id as Id<"videos">;
const teamId = "team_1" as Id<"teams">;

function stackRow(args: {
  id: string;
  versionStackId?: string;
  versionNumber?: number;
  supersededBy?: string;
  project?: string;
}): VersionStackMember {
  return {
    _id: videoId(args.id),
    projectId: (args.project ?? "proj_1") as Id<"projects">,
    versionStackId: args.versionStackId
      ? videoId(args.versionStackId)
      : undefined,
    versionNumber: args.versionNumber,
    supersededByVideoId: args.supersededBy
      ? videoId(args.supersededBy)
      : undefined,
  };
}

/** v1 -> v2 -> v3 with v1 as the stack identity. */
function linearStack() {
  return [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      supersededBy: "v3",
    }),
    stackRow({ id: "v3", versionStackId: "v1", versionNumber: 3 }),
  ];
}

// ---------------------------------------------------------------------------
// Chain validation
// ---------------------------------------------------------------------------

test("implicit v1 without stack fields validates as a single-version stack", () => {
  const video = stackRow({ id: "v1" });
  const result = validateVersionStackChain(video, [video]);
  assert.equal(result.ok, true);
  if (result.ok === true) {
    assert.deepEqual(
      result.oldestToNewest.map((row) => row._id),
      [videoId("v1")],
    );
    assert.equal(result.head._id, videoId("v1"));
  }
});

test("an unstacked video that claims a successor is corruption", () => {
  const video = stackRow({ id: "v1", supersededBy: "v2" });
  const result = validateVersionStackChain(video, [video]);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "chain");
    assert.ok(result.message.length > 0);
  }
});

test("a linear chain validates and orders oldest to newest", () => {
  // Feed the rows out of order: the walk, not the input order, decides.
  const rows = [linearStack()[2], linearStack()[0], linearStack()[1]];
  const result = validateVersionStackChain(rows[1], rows);
  assert.equal(result.ok, true);
  if (result.ok === true) {
    assert.deepEqual(
      result.oldestToNewest.map((row) => row._id),
      [videoId("v1"), videoId("v2"), videoId("v3")],
    );
    assert.equal(result.head._id, videoId("v3"));
  }
});

test("two heads are rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({ id: "v2", versionStackId: "v1", versionNumber: 2 }),
    stackRow({ id: "v3", versionStackId: "v1", versionNumber: 3 }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "head");
  }
});

test("a cycle disconnected from the head is rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      supersededBy: "v1",
    }),
    stackRow({ id: "v3", versionStackId: "v1", versionNumber: 3 }),
  ];
  // One head exists (v3), so the head check passes; the walk from the single
  // root cannot cover every row and the chain check rejects it.
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "chain");
  }
});

test("a two-node cycle with no head is rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      supersededBy: "v1",
    }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
});

test("a forked chain (two versions superseded by the same version) is rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      supersededBy: "v4",
    }),
    stackRow({
      id: "v3",
      versionStackId: "v1",
      versionNumber: 3,
      supersededBy: "v4",
    }),
    stackRow({ id: "v4", versionStackId: "v1", versionNumber: 4 }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "chain");
  }
});

test("a supersededBy reference outside the stack is rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v9",
    }),
    stackRow({ id: "v2", versionStackId: "v1", versionNumber: 2 }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "chain");
  }
});

test("versions in different projects are rejected", () => {
  const rows = [
    stackRow({
      id: "v1",
      versionStackId: "v1",
      versionNumber: 1,
      supersededBy: "v2",
    }),
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      project: "proj_2",
    }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "project");
  }
});

test("a queried version missing from its stack rows is rejected", () => {
  const rows = linearStack();
  const orphan = stackRow({
    id: "vX",
    versionStackId: "v1",
    versionNumber: 2,
  });
  const result = validateVersionStackChain(orphan, rows);
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "chain");
  }
});

test("stacks larger than the cap are rejected", () => {
  const rows = [
    ...linearStack(),
    stackRow({ id: "v4", versionStackId: "v1", versionNumber: 4 }),
  ];
  const result = validateVersionStackChain(rows[0], rows, { maxSize: 3 });
  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.equal(result.code, "size");
    assert.match(result.message, /at most 3 versions/);
  }
});

test("a stack whose identity references a deleted root still validates", () => {
  // 0dfb0d1: versionStackId is opaque; the v1 row may already be gone.
  const rows = [
    stackRow({
      id: "v2",
      versionStackId: "v1",
      versionNumber: 2,
      supersededBy: "v3",
    }),
    stackRow({ id: "v3", versionStackId: "v1", versionNumber: 3 }),
  ];
  const result = validateVersionStackChain(rows[0], rows);
  assert.equal(result.ok, true);
  if (result.ok === true) {
    assert.deepEqual(
      result.oldestToNewest.map((row) => row._id),
      [videoId("v2"), videoId("v3")],
    );
  }
});

// ---------------------------------------------------------------------------
// Renumbering and replacement
// ---------------------------------------------------------------------------

test("deleting a middle version closes the gap and prefers the newer survivor", () => {
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    linearStack(),
    videoId("v2"),
  );
  assert.equal(replacementVideoId, videoId("v3"));
  assert.deepEqual(survivorPatches, [
    {
      _id: videoId("v1"),
      versionNumber: 1,
      supersededByVideoId: videoId("v3"),
    },
    { _id: videoId("v3"), versionNumber: 2, supersededByVideoId: undefined },
  ]);
});

test("deleting the head falls back to the older survivor", () => {
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    linearStack(),
    videoId("v3"),
  );
  assert.equal(replacementVideoId, videoId("v2"));
  assert.deepEqual(survivorPatches, [
    {
      _id: videoId("v1"),
      versionNumber: 1,
      supersededByVideoId: videoId("v2"),
    },
    { _id: videoId("v2"), versionNumber: 2, supersededByVideoId: undefined },
  ]);
});

test("deleting the root keeps the stack identity and renumbers from 1", () => {
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    linearStack(),
    videoId("v1"),
  );
  assert.equal(replacementVideoId, videoId("v2"));
  assert.deepEqual(survivorPatches, [
    {
      _id: videoId("v2"),
      versionNumber: 1,
      supersededByVideoId: videoId("v3"),
    },
    { _id: videoId("v3"), versionNumber: 2, supersededByVideoId: undefined },
  ]);
});

test("deleting the only version leaves nothing behind", () => {
  const video = stackRow({ id: "v1" });
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    [video],
    videoId("v1"),
  );
  assert.equal(replacementVideoId, null);
  assert.deepEqual(survivorPatches, []);
});

test("a full stack renumbers to 99 survivors after one deletion", () => {
  const oldestToNewest = Array.from({ length: MAX_VIDEO_STACK_SIZE }, (_, i) =>
    stackRow({
      id: `v${i + 1}`,
      versionStackId: "v1",
      versionNumber: i + 1,
      supersededBy: i + 1 < MAX_VIDEO_STACK_SIZE ? `v${i + 2}` : undefined,
    }),
  );
  const { replacementVideoId, survivorPatches } = planStackRenumber(
    oldestToNewest,
    videoId("v50"),
  );
  assert.equal(replacementVideoId, videoId("v51"));
  assert.equal(survivorPatches.length, MAX_VIDEO_STACK_SIZE - 1);
  assert.deepEqual(
    survivorPatches.map((patch) => patch.versionNumber),
    Array.from({ length: MAX_VIDEO_STACK_SIZE - 1 }, (_, i) => i + 1),
  );
  // The final survivor becomes the head with no successor.
  const last = survivorPatches[survivorPatches.length - 1];
  assert.equal(last._id, videoId("v100"));
  assert.equal(last.versionNumber, MAX_VIDEO_STACK_SIZE - 1);
  assert.equal(last.supersededByVideoId, undefined);
});

test("findPreferredReplacementVideoId mirrors the server choice (9a2c070)", () => {
  const versions = [{ _id: videoId("v3") }, { _id: videoId("v2") }, { _id: videoId("v1") }];
  assert.equal(
    findPreferredReplacementVideoId(versions, videoId("v2")),
    videoId("v3"),
  );
  assert.equal(
    findPreferredReplacementVideoId(versions, videoId("v3")),
    videoId("v2"),
  );
  assert.equal(
    findPreferredReplacementVideoId([{ _id: videoId("v1") }], videoId("v1")),
    null,
  );
  assert.equal(
    findPreferredReplacementVideoId(undefined, videoId("v1")),
    null,
  );
  assert.equal(
    findPreferredReplacementVideoId(versions, videoId("vX")),
    null,
  );
});

// ---------------------------------------------------------------------------
// Grant inheritance
// ---------------------------------------------------------------------------

test("team-mode grants are copied verbatim", () => {
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v1"),
      accessMode: "team",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [
      {
        teamId,
        userClerkId: "user_granted",
        grantedByClerkId: "user_admin",
      },
    ],
    creatorClerkId: "user_other",
    teamId,
    olderVersions: [],
  });
  assert.deepEqual(plan, {
    newVersionRows: [
      { teamId, userClerkId: "user_granted", grantedByClerkId: "user_admin" },
    ],
    olderVersionRows: [],
  });
});

test("restricted mode synthesizes a grant for the previous uploader", () => {
  // The uploader-identity access check is per row; without a synthesized
  // grant the previous uploader would lose access to their own next cut.
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v1"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [],
    creatorClerkId: "user_other",
    teamId,
    olderVersions: [],
  });
  assert.deepEqual(plan.newVersionRows, [
    { teamId, userClerkId: "user_uploader", grantedByClerkId: "user_other" },
  ]);
  // Reciprocal: the creator also gets a grant on the head they replaced.
  assert.deepEqual(plan.olderVersionRows, [
    {
      videoId: videoId("v1"),
      row: { teamId, userClerkId: "user_other", grantedByClerkId: "user_other" },
    },
  ]);
});

test("no synthesized grant when the uploader cuts the version themself", () => {
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v1"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [],
    creatorClerkId: "user_uploader",
    teamId,
    olderVersions: [],
  });
  assert.deepEqual(plan, { newVersionRows: [], olderVersionRows: [] });
});

test("no duplicate grant when the uploader already holds one", () => {
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v1"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [
      {
        teamId,
        userClerkId: "user_uploader",
        grantedByClerkId: "user_admin",
      },
    ],
    creatorClerkId: "user_other",
    teamId,
    olderVersions: [],
  });
  assert.deepEqual(plan.newVersionRows, [
    { teamId, userClerkId: "user_uploader", grantedByClerkId: "user_admin" },
  ]);
  // The creator holds no grant and uploaded nothing here: one backfill.
  assert.deepEqual(plan.olderVersionRows, [
    {
      videoId: videoId("v1"),
      row: { teamId, userClerkId: "user_other", grantedByClerkId: "user_other" },
    },
  ]);
});

test("implicit team access mode inherits without synthesis", () => {
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v1"),
      accessMode: undefined,
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [],
    creatorClerkId: "user_other",
    teamId,
    olderVersions: [],
  });
  assert.deepEqual(plan, { newVersionRows: [], olderVersionRows: [] });
});

test("restricted mode backfills a creator grant on every older version", () => {
  // An admin who cuts v3 of a restricted stack must be able to view v1 and
  // v2 afterwards, or the version selector dead-ends on videos.get FORBIDDEN.
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v2"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [],
    creatorClerkId: "user_admin",
    teamId,
    olderVersions: [
      {
        _id: videoId("v1"),
        uploadedByClerkId: "user_uploader",
        granteeClerkIds: [],
      },
    ],
  });
  assert.deepEqual(plan.olderVersionRows, [
    {
      videoId: videoId("v2"),
      row: { teamId, userClerkId: "user_admin", grantedByClerkId: "user_admin" },
    },
    {
      videoId: videoId("v1"),
      row: { teamId, userClerkId: "user_admin", grantedByClerkId: "user_admin" },
    },
  ]);
});

test("the backfill is idempotent for versions the creator can already access", () => {
  // The creator uploaded v1 themself and already holds a grant on the head
  // (v3): no duplicate rows anywhere.
  const plan = planInheritedVersionGrants({
    head: {
      _id: videoId("v3"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
    },
    headGrants: [
      { teamId, userClerkId: "user_admin", grantedByClerkId: "user_uploader" },
    ],
    creatorClerkId: "user_admin",
    teamId,
    olderVersions: [
      {
        _id: videoId("v1"),
        uploadedByClerkId: "user_admin",
        granteeClerkIds: [],
      },
      {
        _id: videoId("v2"),
        uploadedByClerkId: "user_uploader",
        granteeClerkIds: ["user_admin"],
      },
    ],
  });
  assert.deepEqual(plan.olderVersionRows, []);
});

// ---------------------------------------------------------------------------
// Share-link inheritance decision table
// ---------------------------------------------------------------------------

test("share links follow the new head when one exists", () => {
  assert.deepEqual(
    planShareLinkHeadChange({
      linkVideoId: videoId("v1"),
      changedVideoId: videoId("v1"),
      newHeadVideoId: videoId("v2"),
    }),
    { action: "repoint", videoId: videoId("v2") },
  );
});

test("share links die with the last version of a stack", () => {
  assert.deepEqual(
    planShareLinkHeadChange({
      linkVideoId: videoId("v1"),
      changedVideoId: videoId("v1"),
      newHeadVideoId: null,
    }),
    { action: "delete" },
  );
});

test("links that do not point at the changed video are untouched", () => {
  // A middle version deletion must not disturb links on the head.
  assert.deepEqual(
    planShareLinkHeadChange({
      linkVideoId: videoId("v3"),
      changedVideoId: videoId("v2"),
      newHeadVideoId: videoId("v3"),
    }),
    { action: "keep" },
  );
});

// ---------------------------------------------------------------------------
// Share-link repoint at ready
//
// Three pinned behaviors: links still resolve during an uploading head
// (createVersion performs no repoint; getByShareGrant keeps serving the
// previous ready head the links still point at), the repoint happens exactly
// when the new version turns ready and is the head, and a failed or rolled
// back version upload never moves the links.
// ---------------------------------------------------------------------------

test("a version turning ready moves the waiting links exactly when it is the head", () => {
  assert.deepEqual(
    planShareLinkRepointOnReady({
      readyVideo: {
        _id: videoId("v3"),
        versionStackId: videoId("v1"),
        supersededByVideoId: undefined,
      },
      stackRows: linearStack(),
    }),
    { toVideoId: videoId("v3"), fromVideoIds: [videoId("v1"), videoId("v2")] },
  );
});

test("a superseded version finishing late never steals the links", () => {
  // v2 was superseded while uploading and turns ready after v3 did: the
  // links sit on the current head (v3) and must stay there.
  assert.equal(
    planShareLinkRepointOnReady({
      readyVideo: {
        _id: videoId("v2"),
        versionStackId: videoId("v1"),
        supersededByVideoId: videoId("v3"),
      },
      stackRows: linearStack(),
    }),
    null,
  );
});

test("standalone videos and unwaited stacks repoint nothing on ready", () => {
  assert.equal(
    planShareLinkRepointOnReady({
      readyVideo: {
        _id: videoId("v1"),
        versionStackId: undefined,
        supersededByVideoId: undefined,
      },
      stackRows: [stackRow({ id: "v1" })],
    }),
    null,
  );
  // A ready head whose stack holds no waiting versions moves nothing.
  assert.deepEqual(
    planShareLinkRepointOnReady({
      readyVideo: {
        _id: videoId("v1"),
        versionStackId: videoId("v1"),
        supersededByVideoId: undefined,
      },
      stackRows: [stackRow({ id: "v1", versionStackId: "v1", versionNumber: 1 })],
    }),
    { toVideoId: videoId("v1"), fromVideoIds: [] },
  );
});

// ---------------------------------------------------------------------------
// Abandoned upload rollback
// ---------------------------------------------------------------------------

test("never-ingested version rows roll back", () => {
  assert.equal(
    shouldRollbackAbandonedVersionRow({
      versionStackId: videoId("v1"),
      versionNumber: 2,
      status: "uploading",
      muxAssetId: undefined,
    }),
    true,
  );
  assert.equal(
    shouldRollbackAbandonedVersionRow({
      versionStackId: videoId("v1"),
      versionNumber: 2,
      status: "failed",
      muxAssetId: undefined,
    }),
    true,
  );
});

test("ingested, ready, and v1 rows fail in place instead", () => {
  assert.equal(
    shouldRollbackAbandonedVersionRow({
      versionStackId: videoId("v1"),
      versionNumber: 2,
      status: "ready",
      muxAssetId: "asset_1",
    }),
    false,
  );
  assert.equal(
    shouldRollbackAbandonedVersionRow({
      versionStackId: videoId("v1"),
      versionNumber: 2,
      status: "processing",
      muxAssetId: "asset_1",
    }),
    false,
  );
  assert.equal(
    shouldRollbackAbandonedVersionRow({
      versionStackId: undefined,
      versionNumber: undefined,
      status: "uploading",
      muxAssetId: undefined,
    }),
    false,
  );
});

test("the abandoned-upload sweep never patches a ready video", () => {
  assert.equal(
    shouldFinalizeAbandonedUpload({
      status: "ready",
      uploadSessionToken: undefined,
      s3Key: "videos/v1/key",
      muxAssetId: "asset_1",
    }),
    false,
  );
});

test("the sweep only claims legacy sessions that never settled", () => {
  // Legacy row without a session token, still uploading: the sweep may act.
  assert.equal(
    shouldFinalizeAbandonedUpload({
      status: "uploading",
      uploadSessionToken: undefined,
      s3Key: "videos/v1/key",
      muxAssetId: undefined,
    }),
    true,
  );
  // A token-bearing session is not the sweep's to claim: stale.
  assert.equal(
    shouldFinalizeAbandonedUpload({
      status: "uploading",
      uploadSessionToken: "tok_1",
      s3Key: "videos/v1/key",
      muxAssetId: undefined,
    }),
    false,
  );
  // Already failed: short-circuit, no second patch.
  assert.equal(
    shouldFinalizeAbandonedUpload({
      status: "failed",
      uploadSessionToken: undefined,
      s3Key: undefined,
      muxAssetId: undefined,
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// Version number helpers
// ---------------------------------------------------------------------------

test("missing version numbers read as v1", () => {
  assert.equal(normalizeVersionNumber({ versionNumber: undefined }), 1);
  assert.equal(normalizeVersionNumber({ versionNumber: 7 }), 7);
});

test("the head is the version nothing supersedes", () => {
  assert.equal(isStackHead({ supersededByVideoId: undefined }), true);
  assert.equal(
    isStackHead({ supersededByVideoId: videoId("v2") }),
    false,
  );
});

// ---------------------------------------------------------------------------
// Head filter + sort + cap composition
// ---------------------------------------------------------------------------

test("sort selection maps each sort to its heads-only index scan", () => {
  assert.deepEqual(resolveProjectVideoListScan(), {
    index: "by_project_and_superseded_by_video_id",
    order: "desc",
  });
  assert.deepEqual(resolveProjectVideoListScan("recent"), {
    index: "by_project_and_superseded_by_video_id",
    order: "desc",
  });
  assert.deepEqual(resolveProjectVideoListScan("title-asc"), {
    index: "by_project_id_and_superseded_by_video_id_and_title",
    order: "asc",
  });
  assert.deepEqual(resolveProjectVideoListScan("title-desc"), {
    index: "by_project_id_and_superseded_by_video_id_and_title",
    order: "desc",
  });
});

type ListingFixture = Pick<
  Doc<"videos">,
  "_id" | "accessMode" | "uploadedByClerkId" | "supersededByVideoId" | "title"
> & { _creationTime: number };

/** Fake paginated source: serves `rows` in pages of `pageSize`. */
function fakeSource<T>(rows: T[], pageSize: number) {
  let calls = 0;
  return {
    paginate: async (): Promise<PaginationResult<T>> => {
      calls += 1;
      const page = rows.slice((calls - 1) * pageSize, calls * pageSize);
      return {
        page,
        isDone: calls * pageSize >= rows.length,
        continueCursor: `cursor-${calls}`,
      };
    },
  };
}

/**
 * Simulates the index scan the collector runs: heads only, in index order.
 * This is the contract resolveProjectVideoListScan describes, so the
 * composition test exercises exactly what videos.list does. Convex orders
 * string index keys by UTF-8 byte order, not locale order, so the title sort
 * compares bytes.
 */
function simulateProjectVideoIndexScan(
  videos: ListingFixture[],
  scan: ReturnType<typeof resolveProjectVideoListScan>,
) {
  const heads = videos.filter((video) => isStackHead(video));
  if (scan.index === "by_project_id_and_superseded_by_video_id_and_title") {
    const byTitle = [...heads].sort((left, right) =>
      Buffer.compare(Buffer.from(left.title), Buffer.from(right.title)),
    );
    return scan.order === "asc" ? byTitle : byTitle.reverse();
  }
  return [...heads].sort((left, right) => right._creationTime - left._creationTime);
}

const memberMembership = {
  role: "member",
  userClerkId: "user_member",
} as never;

async function collectListedVideos(
  videos: ListingFixture[],
  sort: "recent" | "title-asc" | "title-desc",
  grantedVideoIds: ReadonlySet<Id<"videos">>,
) {
  const scan = resolveProjectVideoListScan(sort);
  const yielded = simulateProjectVideoIndexScan(videos, scan);
  const accessible = await collectAcceptedUpToCap(fakeSource(yielded, 100), {
    accepts: (video) =>
      canTeamMemberAccessVideoWithGrantSet({
        grantedVideoIds,
        membership: memberMembership,
        video,
      }),
  });
  return capRawPage(accessible.accepted);
}

test("listings show stack heads only, composed with the ACL filter", async () => {
  const videos: ListingFixture[] = [
    {
      _id: videoId("v1"),
      accessMode: "team",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: videoId("v2"),
      title: "Alpha cut (superseded v1)",
      _creationTime: 1,
    },
    {
      _id: videoId("v2"),
      accessMode: "team",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: undefined,
      title: "Alpha cut",
      _creationTime: 2,
    },
    {
      _id: videoId("v3"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: undefined,
      title: "Beta cut (no grant)",
      _creationTime: 3,
    },
    {
      _id: videoId("v4"),
      accessMode: "restricted",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: undefined,
      title: "Gamma cut (granted)",
      _creationTime: 4,
    },
  ];
  const granted = new Set<Id<"videos">>([videoId("v4")]);

  const { items, hasMore } = await collectListedVideos(videos, "recent", granted);
  assert.equal(hasMore, false);
  // v1 is a superseded version: never listed even though it is accessible.
  // v3 is restricted without a grant for this member: filtered by the ACL.
  assert.deepEqual(
    items.map((video) => video._id),
    [videoId("v4"), videoId("v2")],
  );
});

test("alphabetical sorts keep index order through the ACL filter and cap", async () => {
  const videos: ListingFixture[] = Array.from({ length: 105 }, (_, i) => ({
    _id: videoId(`head${i}`),
    accessMode: "team" as const,
    uploadedByClerkId: "user_uploader",
    supersededByVideoId: undefined,
    title: `Cut ${String(i).padStart(3, "0")}`,
    _creationTime: i,
  }));
  // Restricted heads without grants sort before every "Cut" title: they must
  // be skipped without consuming the cap.
  const restricted: ListingFixture[] = [0, 1, 2].map((i) => ({
    _id: videoId(`restricted${i}`),
    accessMode: "restricted" as const,
    uploadedByClerkId: "user_uploader",
    supersededByVideoId: undefined,
    title: `AAA Locked ${String(i).padStart(3, "0")}`,
    _creationTime: 200 + i,
  }));

  const all = [...videos, ...restricted];
  const ascending = await collectListedVideos(all, "title-asc", new Set());
  assert.equal(ascending.hasMore, true);
  assert.equal(ascending.items.length, LIST_ITEM_CAP);
  // The three locked heads are skipped, not counted: the first kept items
  // are still the first three accessible cuts.
  assert.deepEqual(
    ascending.items.slice(0, 3).map((video) => video.title),
    ["Cut 000", "Cut 001", "Cut 002"],
  );

  const descending = await collectListedVideos(all, "title-desc", new Set());
  assert.equal(descending.hasMore, true);
  // cap + 1 accepted items prove truncation; capRawPage keeps the first 100
  // in index order, so the tail cuts 004..000 are the ones dropped.
  assert.deepEqual(
    descending.items.slice(0, 3).map((video) => video.title),
    ["Cut 104", "Cut 103", "Cut 102"],
  );
});

test("title sorts follow UTF-8 byte order, not locale order", async () => {
  const videos: ListingFixture[] = [
    {
      _id: videoId("apple"),
      accessMode: "team",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: undefined,
      title: "apple cut",
      _creationTime: 1,
    },
    {
      _id: videoId("Banana"),
      accessMode: "team",
      uploadedByClerkId: "user_uploader",
      supersededByVideoId: undefined,
      title: "Banana cut",
      _creationTime: 2,
    },
  ];

  // Convex compares index keys byte by byte: uppercase "B" (0x42) sorts
  // before lowercase "a" (0x61), the opposite of localeCompare.
  const ascending = await collectListedVideos(videos, "title-asc", new Set());
  assert.deepEqual(
    ascending.items.map((video) => video.title),
    ["Banana cut", "apple cut"],
  );

  const descending = await collectListedVideos(videos, "title-desc", new Set());
  assert.deepEqual(
    descending.items.map((video) => video.title),
    ["apple cut", "Banana cut"],
  );
});

// ---------------------------------------------------------------------------
// listVersions access filter
// ---------------------------------------------------------------------------

test("listVersions drops restricted versions the caller cannot access", () => {
  const versions = [
    {
      _id: videoId("v1"),
      accessMode: "restricted" as const,
      uploadedByClerkId: "user_uploader",
    },
    {
      _id: videoId("v2"),
      accessMode: "restricted" as const,
      uploadedByClerkId: "user_admin",
    },
    {
      _id: videoId("v3"),
      accessMode: "team" as const,
      uploadedByClerkId: "user_other",
    },
  ];
  const membership = { userClerkId: "user_admin" };

  // The caller uploaded v2 only: v1 is invisible without a grant, team-mode
  // v3 stays visible.
  assert.deepEqual(
    filterAccessibleStackVersions(versions, {
      grantedVideoIds: new Set(),
      membership,
    }).map((version) => version._id),
    [videoId("v2"), videoId("v3")],
  );

  // A grant on v1 makes the sibling visible again.
  assert.deepEqual(
    filterAccessibleStackVersions(versions, {
      grantedVideoIds: new Set([videoId("v1")]),
      membership,
    }).map((version) => version._id),
    [videoId("v1"), videoId("v2"), videoId("v3")],
  );
});

// ---------------------------------------------------------------------------
// Access-settings write budget
// ---------------------------------------------------------------------------

test("the access-settings write budget counts deletes, inserts, and patches", () => {
  // Two versions without grants and one with two: (0+5+1) + (2+5+1) +
  // (0+5+1) = 20 writes — per version the existing grants, the new grantees,
  // and one patch.
  assert.equal(
    countAccessSettingsWrites({
      existingGrantsPerVersion: [0, 2, 0],
      newGranteeCount: 5,
    }),
    20,
  );

  // A full stack with a grant copy on every version and ten new grantees
  // needs 2,100 writes: the update rejects before the first write.
  assert.ok(
    countAccessSettingsWrites({
      existingGrantsPerVersion: Array.from(
        { length: MAX_VIDEO_STACK_SIZE },
        () => 10,
      ),
      newGranteeCount: 10,
    }) > MAX_MUTATION_DOCUMENT_WRITES,
  );
});
