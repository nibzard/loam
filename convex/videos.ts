import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { identityEmail, identityName, requireProjectAccess, requireVideoAccess } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { generateUniqueToken } from "./security";
import { resolveActiveShareGrant } from "./shareAccess";
import { assertTeamCanStoreBytes } from "./billingHelpers";
import {
  classifyUploadCompletionAttempt,
  classifyUploadFailureAttempt,
  doesUploadReferenceMatch,
  getNextUploadGeneration,
  getUploadCleanupTargets,
  STALE_UPLOAD_OBJECT_CLEANUP_DELAY_MS,
} from "./uploadSessions";

const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

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

async function deleteShareAccessGrantsForLink(
  ctx: MutationCtx,
  linkId: Id<"shareLinks">,
) {
  const grants = await ctx.db
    .query("shareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", linkId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

function buildClientVideoSummary(
  video: Pick<
    Doc<"videos">,
    "_id" | "title" | "description" | "duration" | "thumbnailUrl"
  >,
) {
  return {
    _id: video._id,
    title: video.title,
    description: video.description,
    duration: video.duration,
    thumbnailUrl: video.thumbnailUrl,
  };
}

function buildPlaybackTarget(
  video: Pick<
    Doc<"videos">,
    "_id" | "muxAssetId" | "muxPlaybackId" | "status" | "thumbnailUrl" | "visibility"
  >,
) {
  return {
    _id: video._id,
    muxAssetId: video.muxAssetId,
    muxPlaybackId: video.muxPlaybackId,
    status: video.status,
    thumbnailUrl: video.thumbnailUrl,
    visibility: video.visibility,
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

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return await Promise.all(
      videos.map(async (video) => {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_video", (q) => q.eq("videoId", video._id))
          .collect();

        return {
          ...video,
          uploaderName: video.uploaderName ?? "Unknown",
          commentCount: comments.length,
        };
      }),
    );
  },
});

export const get = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video, membership } = await requireVideoAccess(ctx, args.videoId);
    return {
      ...video,
      uploaderName: video.uploaderName ?? "Unknown",
      role: membership.role,
    };
  },
});

export const getByPublicId = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!video || video.visibility !== "public" || video.status !== "ready") {
      return null;
    }

    return {
      video: buildClientVideoSummary(video),
    };
  },
});

export const getPublicIdByVideoId = query({
  args: { videoId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const normalizedVideoId = ctx.db.normalizeId("videos", args.videoId);
    if (!normalizedVideoId) {
      return null;
    }

    const video = await ctx.db.get(normalizedVideoId);
    if (!video || video.visibility !== "public" || video.status !== "ready" || !video.publicId) {
      return null;
    }

    return video.publicId;
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
    await requireVideoAccess(ctx, args.videoId, "member");

    await ctx.db.patch(args.videoId, {
      visibility: args.visibility,
    });

    await ctx.scheduler.runAfter(0, internal.videoActions.syncPlaybackAccessForVideo, {
      videoId: args.videoId,
    });
  },
});

export const remove = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { video } = await requireVideoAccess(ctx, args.videoId, "admin");

    if (video.s3Key || video.muxAssetId) {
      await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
        videoId: video._id,
        s3Key: video.s3Key,
        muxAssetId: video.muxAssetId,
      });
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }

    const watchEvents = await ctx.db
      .query("videoWatchEvents")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const watchEvent of watchEvents) {
      await ctx.db.delete(watchEvent._id);
    }

    const shareLinks = await ctx.db
      .query("shareLinks")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();
    for (const link of shareLinks) {
      await deleteShareAccessGrantsForLink(ctx, link._id);
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(args.videoId);
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
      throw new Error("Ready videos cannot be replaced through the upload pipeline.");
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

export const getPublicPlaybackTarget = internalQuery({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!video || video.visibility !== "public" || video.status !== "ready") {
      return null;
    }

    return buildPlaybackTarget(video);
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
