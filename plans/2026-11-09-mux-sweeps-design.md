# Mux Sweeps Design: Status Reconciliation And Stale-Upload Reclamation

Date: 2026-11-09
Status: Proposed (design only; no code in this change)
Owner file: `plans/2026-11-09-mux-sweeps-design.md`
Parent plan: `plans/2026-11-09-upstream-alignment.md`, Workstream 3 (reliability)
Sources: upstream `pingdotgg/lawn` commits `760626b`, `3c19349`, `416e660`, `62c0463`, `a11a73d`, `47ee075`

This machine has no Convex credentials. `convex/_generated` cannot be regenerated here,
so this change ships the plan only. An engineer with credentials executes Part 11 through
Part 16 in one sitting.

## 1. Problem

Two failure modes strand video rows today:

- A Mux asset finishes or errors, but the webhook is missed. The video stays
  `processing` forever. Nothing polls Mux, so nothing recovers it.
- A browser uploads the object, then the tab closes before `markUploadComplete`
  runs. Or Mux ingest fails transiently after a successful upload. The video
  stays `uploading` or `failed`, the S3 object sits in the bucket, and the
  uploader must start from byte zero.

Upstream fixed both: per-minute Mux status reconciliation (`3c19349`, hardened in
`416e660`, `62c0463`, `a11a73d`) and 24-hour stale-upload reclamation with an
upload heartbeat (`760626b`, refined in `47ee075`).

## 2. Upstream source map

| Element | Upstream SHA | Notes |
| --- | --- | --- |
| `uploadUpdatedAt` heartbeat field + writes on every transition | `760626b` | create, setUploadInfo, markAsProcessing, markAsReady, markAsFailed, claim |
| `by_status_and_upload_updated_at` index | `760626b` | |
| `listStaleUploadCandidates`, `claimStaleUpload` | `760626b` | claim-then-act so concurrent sweeps stay safe |
| `sweepStaleUploads` hourly cron, 24 h threshold, batch 100 | `760626b` | `STALE_UPLOAD_THRESHOLD_MS`, `STALE_UPLOAD_SWEEP_BATCH_SIZE` |
| "Retry processing" without re-upload (soft fail keeps the object) | `760626b` | `markUploadComplete` accepts `failed`, sentinel error message, UI button |
| `checkMuxAssetStatus` action + 10 s client poll on the video page | `3c19349` | |
| `reconcileMuxAssetStatus` (prepare/ready/errored/skip) | `3c19349` | ready branch creates a **public** playback id — forbidden here, see Part 3 |
| `getMuxProcessingState` internal query | `3c19349` | |
| `markAsReady` guard (asset id must match) | `3c19349` | ours already guards via `doesUploadReferenceMatch` |
| `markMuxAssetAsFailed` internal mutation | `3c19349` | not ported; our `markAsFailed` already covers it, see Part 7.1 |
| `sweepMuxAssetStatuses` per-minute cron, batch 10 | `3c19349` | |
| `cronLocks` table, `claimCronLock`, `releaseCronLock` | `416e660` | sweep serialization; lock name `mux-status-sweep`, TTL 5 min |
| `muxLastPolledAt` field + `by_status_and_mux_last_polled_at` index | `416e660` | |
| `claimMuxProcessingCandidates` claiming mutation | `416e660` | replaces `3c19349`'s read-only `listMuxProcessingCandidates` |
| Initialize `muxLastPolledAt` when entering `processing` | `62c0463` | rows missing the field are invisible to the index, so the sweep never found new rows |
| Round-robin fairness: `take(limit * 3)`, rotate asset-less rows, early break | `a11a73d` | |
| Legacy-row query for uploads without timestamps | `47ee075` | we replace it with a one-time backfill, see Part 12 |

## 3. Guardrails

1. Playback is signed. Assets are created with `playback_policies: ["signed"]`
   (`convex/mux.ts`, `createMuxAssetFromInputUrl`). The sweep must mint or reuse
   a **signed** playback id only. Upstream's ready branch calls
   `createPublicPlaybackId` when no public id exists (`3c19349`). That branch is
   forbidden. Do not port it, do not call `createPublicPlaybackId`, and do not
   persist an unsigned `stream.mux.com` or `image.mux.com` URL. Replace the
   branch with the signed-id resolution in Part 6.3.
2. Session-token checks stay. The upload-session state machine in
   `convex/uploadSessions.ts` (`classifyUploadCompletionAttempt`,
   `classifyUploadFailureAttempt`, `doesUploadReferenceMatch`) is the fork's
   defense against stale client claims. The sweep and the retry path reuse its
   guards. No sweep function accepts a client-supplied
   `uploadSessionToken` it did not issue or observe.
3. The stale sweeper is internal. `internalAction` and `internalMutation` are
   not callable by clients. Its claim re-checks status, age, and storage before
   it patches, so a concurrent client completion wins the race safely.
4. Access checks stay on public actions. `checkMuxAssetStatus` calls
   `requireVideoMemberAccess` (member role or higher), the same guard as every
   upload action in `convex/videoActions.ts`.
5. No new tables or functions ship in this change. Part 4 and Part 6/7 name
   every schema and function addition for the implementation commit.

## 4. Schema additions (`convex/schema.ts`)

All additions are optional fields or a new table. Old code ignores them, so the
push is additive with no data migration.

On the `videos` table, add next to `uploadGeneration`:

```ts
    uploadGeneration: v.optional(v.number()),
    uploadSessionToken: v.optional(v.string()),
    uploadUpdatedAt: v.optional(v.number()),
    muxLastPolledAt: v.optional(v.number()),
```

On the `videos` table indexes, append:

```ts
    .index("by_status_and_upload_updated_at", ["status", "uploadUpdatedAt"])
    .index("by_status_and_mux_last_polled_at", ["status", "muxLastPolledAt"]),
```

New table (after `videoMemberGrants`):

```ts
  cronLocks: defineTable({
    name: v.string(),
    owner: v.string(),
    expiresAt: v.number(),
  }).index("by_name", ["name"]),
```

Cite: fields and the upload index from `760626b`; `cronLocks`, `muxLastPolledAt`,
and the mux index from `416e660`.

Index behavior note: Convex excludes rows whose indexed field is `undefined`
from that index. Two consequences drive the design:

- Every transition into `processing` writes `muxLastPolledAt` (`62c0463`).
  Without it, newly processing rows are invisible to the sweep.
- Every transition writes `uploadUpdatedAt`. Pre-existing rows lack both
  fields, so Part 12 backfills them once.

## 5. Heartbeat write points (`convex/videos.ts`)

Our upload is one presigned PUT (1 h presign, 5 GiB cap). There are no
mid-upload server calls, so upstream's `touchUploadActivity` (`760626b`, needed
for multipart part-signing batches) is not ported. The bracket points are
enough: a PUT either completes within the hour or the uploader re-requests
`getUploadUrl`, which rotates the session and refreshes the timestamp.

Add `uploadUpdatedAt: Date.now()` to the patch or insert in:

1. `create` — the `ctx.db.insert("videos", ...)` call (`760626b`).
2. `setUploadInfo` — covers retry rotation of the session (`760626b`).
3. `markAsProcessing` — both the `start_ingest` and the new retry path
   (Part 7.1). Also write `muxLastPolledAt: Date.now()` here (`62c0463`).
4. `markAsReady` (`760626b`).
5. `markAsFailed` (`760626b`).
6. `setMuxAssetReference` — also `muxLastPolledAt: Date.now()` (`760626b`,
   `62c0463`).
7. `claimStaleUpload` (Part 7.2) (`760626b`).

## 6. Mux status reconciliation (server)

### 6.1 `convex/mux.ts` — widen the asset type only

Extend the `MuxAsset` type so the sweep can read status and errors. No new
request function is needed; the sweep reuses `getMuxAsset` (already our signed
`muxRequest` path).

```ts
type MuxAsset = {
  duration?: number;
  errors?: { messages?: string[] };
  id?: string;
  passthrough?: string;
  playback_ids?: Array<{ id?: string; policy?: string }>;
  status?: string;
};
```

Cite: `3c19349` reads `asset.status`, `asset.errors`, `asset.duration`.

### 6.2 `convex/cronLocks.ts` — new pure module (no Convex functions)

Mirrors `convex/uploadSessions.ts` and `convex/playbackAccess.ts`: pure decision
logic, unit-testable, no codegen dependency.

```ts
export type CronLockRow = { owner: string; expiresAt: number };

export type CronLockClaimDecision =
  | { action: "deny" }
  | { action: "insert"; owner: string; expiresAt: number }
  | { action: "update"; owner: string; expiresAt: number };

export function planCronLockClaim(
  existing: CronLockRow | null,
  args: { owner: string; ttlMs: number; now: number },
): CronLockClaimDecision {
  if (existing && existing.expiresAt > args.now) {
    return { action: "deny" };
  }
  const expiresAt = args.now + args.ttlMs;
  return existing
    ? { action: "update", owner: args.owner, expiresAt }
    : { action: "insert", owner: args.owner, expiresAt };
}

export function shouldReleaseCronLock(
  existing: CronLockRow | null,
  owner: string,
): boolean {
  return existing?.owner === owner;
}
```

Cite: `416e660` (claim and release semantics).

### 6.3 `convex/videos.ts` — new internal functions

Port with our field shapes. Signatures:

```ts
export const getMuxProcessingState = internalQuery({
  args: { videoId: v.id("videos") },
  // Returns { muxAssetId: string } | null.
  // Null unless status === "processing" and muxAssetId is set.
});

export const claimMuxProcessingCandidates = internalMutation({
  args: { limit: v.number() },
  // Returns Array<{ videoId: Id<"videos">; muxAssetId: string }>.
});

export const claimCronLock = internalMutation({
  args: { name: v.string(); owner: v.string(); ttlMs: v.number() },
  // Returns boolean (true when the lock was acquired).
});

export const releaseCronLock = internalMutation({
  args: { name: v.string(); owner: v.string() },
});
```

`claimMuxProcessingCandidates` body, verbatim semantics from `a11a73d` (fair
round-robin, 3x headroom, rotate asset-less rows, early break):

```ts
handler: async (ctx, args) => {
  // Order by muxLastPolledAt so the oldest-polled processing videos are
  // checked first, giving fair round-robin distribution across the queue.
  // Take extra headroom because some processing videos may not have a
  // muxAssetId yet (the window between markAsProcessing and
  // setMuxAssetReference); those rotate to the back below.
  const videos = await ctx.db
    .query("videos")
    .withIndex("by_status_and_mux_last_polled_at", (q) =>
      q.eq("status", "processing"),
    )
    .take(args.limit * 3);

  const claimedAt = Date.now();
  const candidates: Array<{ videoId: Id<"videos">; muxAssetId: string }> = [];
  for (const video of videos) {
    await ctx.db.patch(video._id, { muxLastPolledAt: claimedAt });
    if (!video.muxAssetId) continue;
    candidates.push({ videoId: video._id, muxAssetId: video.muxAssetId });
    if (candidates.length === args.limit) break;
  }
  return candidates;
},
```

`claimCronLock` / `releaseCronLock` use `planCronLockClaim` /
`shouldReleaseCronLock` over `withIndex("by_name", ...).unique()`; on update
they patch `owner` and `expiresAt`, on deny they return `false`, and release
deletes the row only when the owner matches (`416e660`).

Cite: `getMuxProcessingState` from `3c19349`; claiming from `416e660`;
round-robin from `a11a73d`.

### 6.4 `convex/videoActions.ts` — reconcile, poll entry point, sweep

Add constants next to `MAX_PRESIGNED_PUT_FILE_SIZE_BYTES`:

```ts
export const STALE_UPLOAD_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export const STALE_UPLOAD_SWEEP_BATCH_SIZE = 100;
const MUX_STATUS_SWEEP_BATCH_SIZE = 10;
const MUX_STATUS_SWEEP_LOCK = "mux-status-sweep";
const MUX_STATUS_SWEEP_LOCK_TTL_MS = 5 * 60 * 1000;
```

Cite: `760626b` for the stale constants, `3c19349` for the batch size,
`416e660` for the lock constants. Upstream parks them in `convex/uploadLimits.ts`
(a file we do not have); keep them in `videoActions.ts`.

`reconcileMuxAssetStatus` — module-private, signed-only. This is the
center of the port and the place where upstream's forbidden branch is replaced:

```ts
type MuxAssetCheckResult = {
  status: "preparing" | "ready" | "errored" | "skipped";
};

async function reconcileMuxAssetStatus(
  ctx: ActionCtx,
  params: { videoId: Id<"videos">; muxAssetId: string },
): Promise<MuxAssetCheckResult> {
  const processingVideo = await ctx.runQuery(
    internal.videos.getMuxProcessingState,
    { videoId: params.videoId },
  );
  if (!processingVideo || processingVideo.muxAssetId !== params.muxAssetId) {
    return { status: "skipped" as const };
  }

  const asset = await getMuxAsset(params.muxAssetId);
  if (asset.status === "preparing") {
    return { status: "preparing" as const };
  }

  if (asset.status === "errored") {
    const uploadError =
      asset.errors?.messages?.find((message) => message.length > 0) ??
      "Mux failed to process this asset.";
    const failed = await ctx.runMutation(internal.videos.markAsFailed, {
      videoId: params.videoId,
      muxAssetId: params.muxAssetId,
      uploadError,
      allowProcessingFailure: true,
    });
    return { status: failed.outcome === "applied" ? "errored" : "skipped" };
  }

  // Asset is ready. Signed-only resolution. NEVER resolve or create a public
  // playback id here (upstream 3c19349 does; that branch is forbidden in loam).
  const playbackIds = resolveMuxPlaybackIds(
    (asset.playback_ids ?? []) as Array<{ id?: string; policy?: string }>,
  );
  let signedPlaybackId = playbackIds.signedPlaybackId;
  if (!signedPlaybackId) {
    const created = await createSignedPlaybackId(params.muxAssetId);
    if (!created.id) {
      throw new Error("Mux did not return a signed playback id");
    }
    signedPlaybackId = created.id;
  }

  const updated = await ctx.runMutation(internal.videos.markAsReady, {
    videoId: params.videoId,
    muxAssetId: params.muxAssetId,
    muxPlaybackId: signedPlaybackId,
    duration: typeof asset.duration === "number" ? asset.duration : undefined,
    // Thumbnails are per-session signed tokens in loam. Never persist an
    // unsigned image.mux.com URL (upstream passes buildMuxThumbnailUrl here).
    thumbnailUrl: undefined,
  });
  return { status: updated.applied ? "ready" : "skipped" };
}
```

Why this maps cleanly onto our functions:

- Our `markAsReady` already refuses when
  `doesUploadReferenceMatch(video, { muxAssetId })` fails, which is exactly
  upstream's "asset id must match" guard from `3c19349`.
- Our `markAsFailed` with `muxAssetId` plus `allowProcessingFailure: true`
  already implements upstream's `markMuxAssetAsFailed` (`3c19349`), so we do
  not port that mutation. Note the errored branch is a **hard** failure: do not
  pass `preserveStorage` (Part 7.1). Mux inspected the asset and rejected it,
  so the object is not worth keeping. This matches the webhook's
  `video.asset.errored` path.

Public action for the client poll (`3c19349`, guard swapped for ours):

```ts
export const checkMuxAssetStatus = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    status: v.union(
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("errored"),
      v.literal("skipped"),
    ),
  }),
  handler: async (ctx, args): Promise<MuxAssetCheckResult> => {
    await requireVideoMemberAccess(ctx, args.videoId);
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });
    if (!video || video.status !== "processing" || !video.muxAssetId) {
      return { status: "skipped" };
    }
    return await reconcileMuxAssetStatus(ctx, {
      videoId: args.videoId,
      muxAssetId: video.muxAssetId,
    });
  },
});
```

Deviation: upstream gates with `getVideoForPlayback` (viewer level). We gate
with `requireVideoMemberAccess`, matching every other upload-path action here.
Viewers still recover stuck videos within a minute through the cron.

The sweep, with lock serialization from `416e660`:

```ts
export const sweepMuxAssetStatuses = internalAction({
  args: {},
  returns: v.object({
    checked: v.number(),
    reconciled: v.number(),
  }),
  handler: async (ctx) => {
    const lockOwner = crypto.randomUUID();
    const locked = await ctx.runMutation(internal.videos.claimCronLock, {
      name: MUX_STATUS_SWEEP_LOCK,
      owner: lockOwner,
      ttlMs: MUX_STATUS_SWEEP_LOCK_TTL_MS,
    });
    if (!locked) {
      return { checked: 0, reconciled: 0 };
    }

    try {
      const candidates = await ctx.runMutation(
        internal.videos.claimMuxProcessingCandidates,
        { limit: MUX_STATUS_SWEEP_BATCH_SIZE },
      );
      let checked = 0;
      let reconciled = 0;

      for (const candidate of candidates) {
        try {
          const result = await reconcileMuxAssetStatus(ctx, candidate);
          checked += 1;
          if (result.status === "ready" || result.status === "errored") {
            reconciled += 1;
          }
        } catch (error) {
          console.error("Failed to reconcile Mux asset status", {
            videoId: candidate.videoId,
            muxAssetId: candidate.muxAssetId,
            error,
          });
        }
      }

      return { checked, reconciled };
    } finally {
      await ctx.runMutation(internal.videos.releaseCronLock, {
        name: MUX_STATUS_SWEEP_LOCK,
        owner: lockOwner,
      });
    }
  },
});
```

Load: 10 assets per minute, one Mux GET each, one mutation per sweep. The lock
prevents overlap when a sweep runs long; the 5-minute TTL unblocks a crashed
owner.

## 7. Stale-upload reclamation

### 7.1 Soft-fail semantics so "Retry processing" can work (`760626b`)

Today `markUploadComplete` handles every ingest failure the same way:
`markAsFailed` clears `s3Key`, `muxAssetId`, and `muxPlaybackId`
(`buildFailedUploadPatch` in `convex/videos.ts`) and schedules deletion of the
object. A transient Mux ingest error therefore destroys a fully uploaded
object. Upstream fixed this in `760626b`: only delete the object for
definitive rejections; keep it otherwise and let the client re-run
`markUploadComplete` without re-uploading.

Change the failure path so the object survives transient ingest errors:

1. `convex/uploadSessions.ts` — extend `classifyUploadFailureAttempt` with an
   option `preserveStorage?: boolean`. When the decision is `apply` and
   `preserveStorage` is true, return
   `{ kind: "apply", cleanup: null }`. Add a pure patch builder next to
   `buildFailedUploadPatch` (which stays in `videos.ts`; move or mirror as a
   pure export so it is testable):

   ```ts
   export function planUploadFailurePatch(uploadError: string | undefined, preserveStorage: boolean) {
     if (preserveStorage) {
       // Soft failure: the uploaded object stays so processing can retry.
       return {
         muxAssetStatus: "errored" as const,
         uploadError,
         status: "failed" as const,
       };
     }
     return null; // caller applies the existing hard-fail patch
   }
   ```

2. `convex/videos.ts` `markAsFailed` — add `preserveStorage:
   v.optional(v.boolean())` to args, thread it into
   `classifyUploadFailureAttempt`. On `apply` with a preserved decision, patch
   only the soft fields plus `uploadUpdatedAt: Date.now()`; skip
   `scheduleUploadCleanup`. Keep `uploadSessionToken` untouched in both paths
   (the hard patch already does), so a late client call still classifies as
   `missing_object` (hard path) or restarts ingest (soft path).

3. `convex/videoActions.ts` `markUploadComplete` catch block — pass
   `preserveStorage: !shouldDeleteObject` to `markAsFailed`, and after an
   applied soft failure throw the sentinel (keep upstream's exact wording so
   the client substring check ports verbatim):

   ```ts
   throw new ConvexError({
     code: "BAD_REQUEST",
     message: "Mux ingest failed after upload. Retry processing without re-uploading.",
   });
   ```

   For definitive rejections (`shouldDeleteObject` true), keep today's
   behavior: rethrow the original error after the hard `markAsFailed`.

4. Restart path. `convex/uploadSessions.ts`
   `classifyUploadCompletionAttempt` returns `{ kind: "retry_required" }` for
   `status: "failed"` with a matching token. Give that variant the object key,
   symmetric with `start_ingest`:

   ```ts
   case "failed":
     return { kind: "retry_required", s3Key };
   ```

   Update the two pinned assertions in `convex/uploadSessions.test.ts` to
   expect the added `s3Key` field (the fixture rows there already carry
   `s3Key: "videos/current.mp4"`).

   Then in `videos.ts` `markAsProcessing`, treat `retry_required` like
   `start_ingest`: patch `status: "processing"`, `muxAssetStatus: "preparing"`,
   `uploadError: undefined`, `uploadUpdatedAt: Date.now()`,
   `muxLastPolledAt: Date.now()`, and return the `started` outcome with
   `s3Key`, `contentType`, and `uploadGeneration`. Drop `retry_required` from
   the mutation's return union and delete the now-dead
   `retry_required` branch in `markUploadComplete` (the
   "Upload session is no longer pending" error).

   This does not weaken the token checks: `retry_required` is only reachable
   after `classifyUploadCompletionAttempt` confirms the caller's token matches
   the stored one and the object key exists. `stale` (token mismatch) and
   `missing_object` keep their meaning. Upstream's `760626b` makes the same
   move (`markUploadComplete` accepts `uploading` and `failed`).

### 7.2 `convex/videos.ts` — new internal functions

```ts
export const listStaleUploadCandidates = internalQuery({
  args: { cutoff: v.number(); limit: v.number() },
  // Returns Array<{ videoId: Id<"videos"> }>.
});

export const claimStaleUpload = internalMutation({
  args: { videoId: v.id("videos"); cutoff: v.number() },
  // Returns { claimed: boolean }.
});
```

`listStaleUploadCandidates` body — adapted from `760626b` (we have no
multipart fields, and `failed` rows now legitimately carry `s3Key` after a
soft failure):

```ts
handler: async (ctx, args) => {
  const statuses = ["uploading", "failed"] as const;
  const candidates = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("videos")
          .withIndex("by_status_and_upload_updated_at", (q) =>
            q.eq("status", status),
          )
          .take(args.limit),
      ),
    )
  )
    .flat()
    .filter((video) => video.s3Key)
    .filter(
      (video) => (video.uploadUpdatedAt ?? video._creationTime) < args.cutoff,
    )
    .sort(
      (a, b) =>
        (a.uploadUpdatedAt ?? a._creationTime) -
        (b.uploadUpdatedAt ?? b._creationTime),
    )
    .slice(0, args.limit);

  return candidates.map((video) => ({ videoId: video._id }));
},
```

Rows missing `uploadUpdatedAt` are invisible to the index, which is why Part 12
backfills them; upstream instead carries a second
`eq("uploadUpdatedAt", undefined)` query (`47ee075`). Prefer the backfill: one
query, no permanent legacy branch.

`claimStaleUpload` body — reuses our existing failure and cleanup helpers so
every path to `failed` looks the same:

```ts
handler: async (ctx, args) => {
  const video = await ctx.db.get(args.videoId);
  if (
    !video ||
    (video.status !== "uploading" && video.status !== "failed") ||
    !video.s3Key ||
    (video.uploadUpdatedAt ?? video._creationTime) >= args.cutoff
  ) {
    return { claimed: false };
  }

  await ctx.db.patch(
    args.videoId,
    buildFailedUploadPatch("Upload expired after a period of inactivity."),
  );
  await ctx.db.patch(args.videoId, { uploadUpdatedAt: Date.now() });
  await scheduleUploadCleanup(ctx, {
    videoId: args.videoId,
    cleanup: getUploadCleanupTargets(video),
    reason: "stale_upload_reclaimed",
  });

  return { claimed: true };
},
```

`buildFailedUploadPatch` clears `s3Key`, so a second claim cannot double-fire
and the scheduled `cleanupDeletedVideoAssets` (immediate run) deletes the
object and any stray asset. A racing `markUploadComplete` loses cleanly:
`classifyUploadCompletionAttempt` returns `missing_object` because the token
matches but the key is gone. Token semantics are untouched.

### 7.3 `convex/videoActions.ts` — the sweeper

```ts
export const sweepStaleUploads = internalAction({
  args: {},
  returns: v.object({ reclaimed: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_UPLOAD_THRESHOLD_MS;
    const candidates = await ctx.runQuery(
      internal.videos.listStaleUploadCandidates,
      { cutoff, limit: STALE_UPLOAD_SWEEP_BATCH_SIZE },
    );
    let reclaimed = 0;

    for (const candidate of candidates) {
      const claimed = await ctx.runMutation(internal.videos.claimStaleUpload, {
        videoId: candidate.videoId,
        cutoff,
      });
      if (claimed.claimed) {
        reclaimed += 1;
      }
    }

    return { reclaimed };
  },
});
```

Storage deletion is scheduled by `claimStaleUpload` inside the mutation, so the
action stays retry-safe: if the action dies mid-loop, every claimed row is
already consistent. Upstream (`760626b`) deletes storage from the action; we
reuse `scheduleUploadCleanup` to keep one cleanup path. No cron lock here,
matching upstream: claims are idempotent and hourly overlap is harmless.

## 8. Cron registration — new file `convex/crons.ts`

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reclaim stale video uploads",
  { hours: 1 },
  internal.videoActions.sweepStaleUploads,
);

crons.interval(
  "reconcile processing Mux assets",
  { minutes: 1 },
  internal.videoActions.sweepMuxAssetStatuses,
);

export default crons;
```

Cite: `760626b` creates the file with the hourly entry; `3c19349` adds the
per-minute entry. Convex auto-registers `convex/crons.ts` on the next
`bunx convex dev` push.

## 9. Client changes

### 9.1 Video page poll (`app/routes/dashboard/-video.tsx`)

Port the 10-second poll from `3c19349` (`app/routes/dashboard/-video.tsx`
there). Add after the canonicalize effect, using our action and our member
gate. `api.videos.get` already returns `status`, `muxAssetId`, and `role`:

```tsx
const checkMuxAssetStatus = useAction(api.videoActions.checkMuxAssetStatus);

useEffect(() => {
  if (
    !resolvedVideoId ||
    video?.status !== "processing" ||
    !video.muxAssetId ||
    !video.role ||
    video.role === "viewer"
  ) {
    return;
  }

  let cancelled = false;
  let timeoutId: number | undefined;

  const pollMuxStatus = async () => {
    try {
      await checkMuxAssetStatus({ videoId: resolvedVideoId });
    } catch (error) {
      console.warn("Failed to check Mux asset status", error);
    }

    if (!cancelled) {
      timeoutId = window.setTimeout(pollMuxStatus, 10_000);
    }
  };

  void pollMuxStatus();

  return () => {
    cancelled = true;
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  };
}, [
  checkMuxAssetStatus,
  resolvedVideoId,
  video?.muxAssetId,
  video?.role,
  video?.status,
]);
```

The poll reconciles the row the member is staring at; the cron covers
everything else within a minute, so the viewer-role restriction costs little.

### 9.2 "Retry processing" UI

Placement matches upstream `760626b`: the upload toast, not the video page.

1. `app/routes/dashboard/-useVideoUploadManager.ts`:
   - Add `canRetryProcessing?: boolean` to `ManagedUploadItem`.
   - In the `uploadFilesToProject` catch: keep the current error surface. Detect
     the sentinel with
     `errorMessage.includes("Retry processing without re-uploading")` and store
     it as `canRetryProcessing`. When it is set, skip the `markUploadFailed`
     call — the action already soft-failed the row, and a hard fail would
     delete the object the retry needs.
   - Add `retryProcessing(uploadId)`: guard on `videoId` and
     `canRetryProcessing`; set the item to `status: "processing"`,
     `canRetryProcessing: false`; call
     `markUploadComplete({ videoId, uploadSessionToken })` (the token is
     already stored on the item); on success set `status: "complete"` and
     proceed to the existing share-link flow; on a retryable sentinel error
     set `canRetryProcessing` again; on any other error set the error state
     and clear the flag.
2. `src/components/upload/UploadProgress.tsx`:
   - Add `onRetryProcessing?: () => void` to the props.
   - In the `status === "error"` block, render the button under the message:

   ```tsx
   {status === "error" && error && (
     <div className="mt-2 space-y-2">
       <p className="text-xs text-[var(--destructive)]">{error}</p>
       {onRetryProcessing && (
         <Button size="sm" variant="outline" onClick={onRetryProcessing}>
           Retry processing
         </Button>
       )}
     </div>
   )}
   ```

   Keep the square button style. No new icons.
3. `src/lib/dashboardUploadContext.tsx`: add `retryProcessing: (uploadId: string) => void`
   to `DashboardUploadContextValue`, and pass it through where the provider is
   wired in `app/routes/dashboard/-layout.tsx`.

Optional follow-up (not in this port): a member-level "Retry processing" button
on the video page's failed state (`-video.tsx` line 445). The upload toast only
exists in the uploader's session, so a failed row discovered later needs the
video page. Defer until someone asks.

## 10. Deliberate deviations and omissions

| Omission or change | Reason |
| --- | --- |
| `createPublicPlaybackId` / public-id branch in the ready path | Forbidden. Signed-only playback; replaced with `resolveMuxPlaybackIds` + `createSignedPlaybackId` (Part 6.3). |
| Persisting `buildMuxThumbnailUrl(playbackId)` on ready | Our posters are per-session signed tokens (`getProjectVideoPosters`, `signThumbnailToken`). A stored unsigned URL would break the signed-session guarantee. Pass `thumbnailUrl: undefined`. |
| `markMuxAssetAsFailed` mutation | Our `markAsFailed` with `muxAssetId` + `allowProcessingFailure: true` already provides the guarded transition (webhook uses it). |
| `touchUploadActivity` | Single-PUT pipeline has no mid-upload server calls. Heartbeat brackets in Part 5 suffice. |
| `sweepOrphanedMultipartUploads` (`416e660`) | We have no multipart uploads. Revisit only if multipart lands (alignment plan open decision 1). |
| `STALE_*` constants in `uploadLimits.ts` | We do not have that file. Constants live in `videoActions.ts`. |
| Sweep deletes storage from the action (`760626b`) | `claimStaleUpload` schedules cleanup via `scheduleUploadCleanup` inside the mutation, reusing our single cleanup path. |
| Legacy `eq("uploadUpdatedAt", undefined)` query (`47ee075`) | Replaced by the one-time backfill in Part 12. |
| `uploadResumeDb` / resume-session changes (`760626b`) | We have no resume DB; the single PUT retry restarts from zero, which is unchanged by this port. |
| Viewer-level `checkMuxAssetStatus` (`3c19349`) | Member-level guard, matching our upload-path actions. The cron still heals viewer-visible rows within a minute. |

## 11. Implementation order (one sitting)

Do these steps in order. Each phase is independently deployable; Part 12 runs
the deploy steps after each phase or once at the end.

Phase A — stale-upload reclamation (`760626b`):

1. Schema: `uploadUpdatedAt` field + `by_status_and_upload_updated_at` index.
2. `uploadSessions.ts`: `retry_required` carries `s3Key`; `preserveStorage`
   option on `classifyUploadFailureAttempt`; `planUploadFailurePatch`.
3. `videos.ts`: heartbeat writes (Part 5); `markAsFailed` `preserveStorage`
   arg; `markAsProcessing` restarts on `retry_required`; drop the dead
   `retry_required` mapping in `markUploadComplete`; `listStaleUploadCandidates`;
   `claimStaleUpload`.
4. `videoActions.ts`: stale constants; `markUploadComplete` sentinel and
   `preserveStorage` threading; `sweepStaleUploads`.
5. Client: manager `canRetryProcessing` + `retryProcessing`; UploadProgress
   button; context wiring.
6. Tests: Part 13 items 2, 3, 6.

Phase B — Mux status reconciliation (`3c19349`, `416e660`, `62c0463`,
`a11a73d`):

7. Schema: `muxLastPolledAt` field + `by_status_and_mux_last_polled_at` index;
   `cronLocks` table.
8. `mux.ts`: widen `MuxAsset`.
9. `cronLocks.ts`: pure helpers.
10. `videos.ts`: `getMuxProcessingState`, `claimMuxProcessingCandidates`,
    `claimCronLock`, `releaseCronLock`; `muxLastPolledAt` writes on
    `markAsProcessing` and `setMuxAssetReference`.
11. `videoActions.ts`: mux constants; `reconcileMuxAssetStatus`;
    `checkMuxAssetStatus`; `sweepMuxAssetStatuses`.
12. `crons.ts`: both registrations (file is new; if Phase A shipped separately,
    it already holds the stale entry).
13. Client: video page poll.
14. Tests: Part 13 items 1, 4, 5.

## 12. Deploy-box migration and regeneration

This machine cannot run these steps (no credentials, and codegen requires
auth). On the deploy box, remember: `bunx convex dev` ships the working tree
straight to production. Treat every push as a prod ship.

1. Branch from `main`; apply Phase A (and Phase B if shipping together).
2. `bun install` (no new dependencies).
3. Run `bunx convex dev` once. It regenerates
   `convex/_generated/api.d.ts` (new `crons` module, new `internal.videos.*`
   and `internal.videoActions.*` references), pushes the additive schema
   (two optional fields, two indexes, one new table — no data migration), the
   functions, and the cron registrations. Approve the additive schema push.
4. Stop the dev process. Run the one-time backfill for rows written before
   this change (they are invisible to the new indexes until patched). Add a
   temporary internal mutation, run it, then remove it in the same sitting:

   ```ts
   export const backfillSweepTimestamps = internalMutation({
     args: {},
     handler: async (ctx) => {
       const videos = await ctx.db.query("videos").collect();
       let patched = 0;
       for (const video of videos) {
         const patch: Record<string, number> = {};
         if (video.uploadUpdatedAt === undefined) {
           patch.uploadUpdatedAt = video._creationTime;
         }
         if (
           video.status === "processing" &&
           video.muxLastPolledAt === undefined
         ) {
           patch.muxLastPolledAt = video._creationTime;
         }
         if (Object.keys(patch).length > 0) {
           await ctx.db.patch(video._id, patch);
           patched += 1;
         }
       }
       return { patched };
     },
   });
   ```

   Run it with `bunx convex run videos:backfillSweepTimestamps --prod`
   (or the dashboard function runner), record the `{ patched }` count, then
   delete the mutation before committing.
5. Run the full validation set (Part 16). Typecheck passes only after step 3's
   regeneration; that ordering is intentional.
6. Commit everything, including `convex/_generated`. Reviewers skip generated
   churn (alignment plan, merge policy item 5).

## 13. Test plan

Mirror the remediation regression style: `node:test` + `assert/strict`, pure
decision functions in `convex/*.test.ts`, mock-ctx action tests where the
handler is exported (`convex/muxActions.test.ts` is the pattern). All run under
`bun test`.

1. `convex/cronLocks.test.ts` (new):
   - `planCronLockClaim` denies while an unexpired lock exists.
   - It steals an expired lock (update action, new owner, `now + ttl`).
   - It inserts when no row exists.
   - `shouldReleaseCronLock` releases only for the owning holder.
2. `convex/uploadSessions.test.ts` (extend):
   - `retry_required` now carries `s3Key` (update the two pinned assertions).
   - A matching token plus `failed` plus `s3Key` yields `retry_required`; a
     mismatched token still yields `stale` (token guarantee unchanged).
   - `classifyUploadFailureAttempt` with `preserveStorage` returns
     `apply` with `cleanup: null`; without it returns `cleanup` targets.
   - `planUploadFailurePatch` soft patch keeps `s3Key` and `muxAssetId`
     unset-but-present semantics: it touches only status, muxAssetStatus, and
     uploadError.
3. Stale-claim regression (pure helper if extracted, else mirror the guard
   inline in the mutation and test the classifier inputs):
   - `uploading` + `s3Key` + old `uploadUpdatedAt` is claimable.
   - `failed` + `s3Key` (soft failure) is claimable.
   - `processing` or `ready` rows with `s3Key` are never claimable — this is
     the fork-specific guard, since our rows keep `s3Key` through processing
     and ready for original-quality playback and downloads.
   - Recent `uploadUpdatedAt` (within 24 h) is not claimable.
   - A row without `s3Key` is never claimable.
4. Signed-playback guard (new test in `convex/videoActions.test.ts`):
   - `resolveMuxPlaybackIds` on a public-only list yields
     `signedPlaybackId: null` and lists the public ids for deletion — the
     sweep must never fall back to a public id.
   - Source-scan guard, in the style of the alignment plan's static
     guarantees: read `convex/videoActions.ts` and assert the string
     `createPublicPlaybackId` does not occur, and read `convex/mux.ts` and
     assert `createPublicPlaybackId` remains uncalled from `videoActions`
     (keep the existing export unused or delete it in the same commit; if
     kept, the scan targets the caller file only).
5. Claim-order regression (mirrors `a11a73d`'s intent without `convex-test`):
   extract nothing; assert via the pure rotation rule if extracted, else cover
   in review with the code comment from Part 6.3. If the team adopts
   `convex-test` later (alignment plan Workstream 3), port upstream's
   asset-less-rotation case from `convex/performanceFixes.vitest.ts`
   (`47ee075`) first.
6. Manager and error mapping:
   - Extend `src/lib/uploadErrors.test.ts`: a `ConvexError` carrying the
     sentinel message surfaces verbatim, so the manager's substring check and
     the displayed text agree.

## 14. Rollout order

1. Phase A (stale reclamation + retry semantics) ships first. It is
   self-contained, and the retry UI depends only on it.
2. Phase B (reconciliation + locks + poll) ships second. It depends on nothing
   from Phase A except the shared constants file placement.
3. Both phases may ship in one sitting as one push each. Run the backfill
   (Part 12 step 4) after the push that adds the fields, before the first cron
   tick matters (within the hour is fine; until then legacy rows simply stay
   invisible to the sweeps, which is today's status quo).
4. Watch the first ticks: Convex dashboard, Functions, cron logs for
   `sweepMuxAssetStatuses` (expect `checked` > 0 only while assets are
   genuinely preparing) and `sweepStaleUploads` (expect `reclaimed` > 0 only
   on the first run if legacy junk exists).

## 15. Rollback

- Disable the crons first: delete the two `crons.interval` registrations and
  push, or delete the cron schedules from the Convex dashboard. The functions
  become inert without callers.
- Revert Phase B: remove the reconcile functions and the poll effect. The
  added fields, indexes, and `cronLocks` table are additive; rolled-back code
  never reads them, so leave them in place rather than pushing a schema
  removal.
- Revert Phase A semantics (soft fail, retry): first let `sweepStaleUploads`
  run once more so soft-failed rows (`failed` + `s3Key`) are reclaimed, or run
  a manual `markUploadFailed` sweep; otherwise those rows keep objects in the
  bucket with no sweeper. Then revert the code. Hard-failed and ready rows are
  unaffected.
- `cronLocks` rows expire by TTL (5 minutes) even if `releaseCronLock` never
  runs; a stale row never blocks a rolled-forward redeploy.

## 16. Validation

Run all four gates and leave them passing:

```bash
bun run lint
bun run typecheck
bun run typecheck:convex
bun test
```

Playback-path additions from the alignment plan apply: no code path may
construct an unsigned `stream.mux.com` or `image.mux.com` URL, and the client
must not call Mux directly (the poll goes through `checkMuxAssetStatus`).

## Open questions

1. Poll gating: member-only (chosen here) or viewer-level as upstream? The
   cron narrows the difference to one minute.
2. Should `createPublicPlaybackId` be deleted outright from `convex/mux.ts`
   (it is currently exported and unused) so the guard is structural? Favored:
   yes, in the Phase B commit.
3. Video-page "Retry processing" for rows discovered after the upload session
   closed: defer, or fold into the failed state in Phase B?
4. If multipart uploads land later (alignment plan open decision 1),
   `touchUploadActivity` and `sweepOrphanedMultipartUploads` (`416e660`) come
   with it; the heartbeat write points in Part 5 then need a mid-upload call.
