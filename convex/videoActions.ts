"use node";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";
import { action, internalAction, ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  createMuxAssetFromInputUrl,
  createSignedPlaybackId,
  createPublicPlaybackId,
  deletePlaybackId,
  deleteMuxAsset,
  getMuxAsset,
  signPlaybackToken,
  signThumbnailToken,
} from "./mux";
import {
  buildPublicPlaybackSession,
  buildSignedPlaybackSession,
  resolveMuxPlaybackIds,
  SIGNED_PLAYBACK_SESSION_TTL,
  type PlaybackSession,
} from "./playbackSessions";
import {
  planPublicPlaybackAccess,
  planSignedPlaybackAccess,
} from "./playbackAccess";
import { BUCKET_NAME, getS3Client } from "./s3";
import { generateOpaqueToken } from "./security";
import { buildMuxUploadPassthrough } from "./uploadSessions";

const GIBIBYTE = 1024 ** 3;
const MAX_PRESIGNED_PUT_FILE_SIZE_BYTES = 5 * GIBIBYTE;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);
const playbackSessionValidator = v.object({
  accessMode: v.union(v.literal("public"), v.literal("signed")),
  expiresAt: v.union(v.number(), v.null()),
  posterUrl: v.string(),
  url: v.string(),
});

const clientVideoSummaryValidator = v.object({
  _id: v.id("videos"),
  title: v.string(),
  description: v.optional(v.string()),
  duration: v.optional(v.number()),
  thumbnailUrl: v.optional(v.string()),
});

const publicVideoDataValidator = v.object({
  video: clientVideoSummaryValidator,
});

const shareVideoDataValidator = v.object({
  allowDownload: v.boolean(),
  grantExpiresAt: v.number(),
  video: clientVideoSummaryValidator,
});

const publicWatchBootstrapValidator = v.union(
  v.object({
    state: v.literal("missing"),
  }),
  v.object({
    state: v.literal("ready"),
    playbackSession: playbackSessionValidator,
    videoData: publicVideoDataValidator,
  }),
);

const sharePlaybackBootstrapValidator = v.union(
  v.object({
    state: v.literal("bootstrapping"),
  }),
  v.object({
    state: v.literal("missing"),
  }),
  v.object({
    state: v.literal("expired"),
  }),
  v.object({
    state: v.literal("processing"),
  }),
  v.object({
    state: v.literal("failed"),
  }),
  v.object({
    state: v.literal("passwordRequired"),
  }),
  v.object({
    state: v.literal("passwordRejected"),
  }),
  v.object({
    state: v.literal("temporarilyUnavailable"),
    retryAfterSeconds: v.union(v.number(), v.null()),
  }),
  v.object({
    state: v.literal("ready"),
    grantToken: v.string(),
    playbackSession: playbackSessionValidator,
    videoData: shareVideoDataValidator,
  }),
);

type PlaybackTarget = {
  _id: Id<"videos">;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl?: string | null;
  visibility: "public" | "private";
};

type GetUploadUrlResult = {
  cleanupScheduled: boolean;
  url: string;
  uploadGeneration: number;
  uploadId: string;
  uploadSessionToken: string;
};

type MarkUploadCompleteResult = {
  outcome: "already_processing" | "already_ready" | "started" | "stale";
  success: boolean;
};

type ClientVideoSummary = {
  _id: Id<"videos">;
  title: string;
  description?: string;
  duration?: number;
  thumbnailUrl?: string;
};

type PublicVideoData = {
  video: ClientVideoSummary;
};

type ShareVideoData = {
  allowDownload: boolean;
  grantExpiresAt: number;
  video: ClientVideoSummary;
};

type PublicWatchBootstrap =
  | { state: "missing" }
  | {
      state: "ready";
      playbackSession: PlaybackSession;
      videoData: PublicVideoData;
    };

type SharePlaybackBootstrap =
  | { state: "bootstrapping" }
  | { state: "missing" }
  | { state: "expired" }
  | { state: "processing" }
  | { state: "failed" }
  | { state: "passwordRequired" }
  | { state: "passwordRejected" }
  | { retryAfterSeconds: number | null; state: "temporarilyUnavailable" }
  | {
      state: "ready";
      grantToken: string;
      playbackSession: PlaybackSession;
      videoData: ShareVideoData;
    };

type ShareAccessGrantResult = {
  failureReason:
    | "expired"
    | "failed"
    | "missing"
    | "passwordRejected"
    | "processing"
    | "rateLimited"
    | "unavailable"
    | null;
  ok: boolean;
  grantToken: string | null;
  retryAfterSeconds: number | null;
};

type MarkUploadFailedResult = {
  cleanupScheduled: boolean;
  outcome: "already_failed" | "applied" | "ignored" | "stale";
  success: boolean;
};

type DownloadTarget = {
  contentType?: string | null;
  s3Key?: string | null;
  status: "failed" | "processing" | "ready" | "uploading";
  title?: string | null;
};

function mapShareGrantFailureToBootstrap(
  failureReason: ShareAccessGrantResult["failureReason"],
  options?: {
    passwordProvided?: boolean;
    retryAfterSeconds?: number | null;
  },
): Exclude<SharePlaybackBootstrap, { state: "bootstrapping" } | { state: "ready" }> {
  switch (failureReason) {
    case "missing":
      return { state: "missing" };
    case "expired":
      return { state: "expired" };
    case "processing":
      return { state: "processing" };
    case "failed":
      return { state: "failed" };
    case "passwordRejected":
      return {
        state: options?.passwordProvided ? "passwordRejected" : "passwordRequired",
      };
    case "rateLimited":
    case "unavailable":
    default:
      return {
        state: "temporarilyUnavailable",
        retryAfterSeconds: options?.retryAfterSeconds ?? null,
      };
  }
}

function getExtensionFromKey(key: string, fallback = "mp4") {
  let source = key;
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      source = new URL(key).pathname;
    } catch {
      source = key;
    }
  }

  const ext = source.split(".").pop();
  if (!ext) return fallback;
  if (ext.length > 8 || /[^a-zA-Z0-9]/.test(ext)) return fallback;
  return ext.toLowerCase();
}

function sanitizeFilename(input: string) {
  const trimmed = input.trim();
  const base = trimmed.length > 0 ? trimmed : "video";
  const sanitized = base
    .replace(/["']/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_");
  return sanitized.slice(0, 120);
}

function buildDownloadFilename(title: string | undefined, key: string) {
  const ext = getExtensionFromKey(key);
  const safeTitle = sanitizeFilename(title ?? "video");
  return safeTitle.endsWith(`.${ext}`) ? safeTitle : `${safeTitle}.${ext}`;
}

function normalizeBucketKey(key: string): string {
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const pathname = new URL(key).pathname.replace(/^\/+/, "");
      const bucketPrefix = `${BUCKET_NAME}/`;
      return pathname.startsWith(bucketPrefix)
        ? pathname.slice(bucketPrefix.length)
        : pathname;
    } catch {
      return key;
    }
  }
  return key;
}

async function buildSignedBucketObjectUrl(
  key: string,
  options?: {
    expiresIn?: number;
    filename?: string;
    contentType?: string;
  },
): Promise<string> {
  const normalizedKey = normalizeBucketKey(key);
  const s3 = getS3Client();
  const filename = options?.filename;
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: normalizedKey,
    ResponseContentDisposition: filename
      ? `attachment; filename="${filename}"`
      : undefined,
    ResponseContentType: options?.contentType,
  });
  return await getSignedUrl(s3, command, { expiresIn: options?.expiresIn ?? 600 });
}

function getValueString(value: unknown, field: string): string | null {
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function normalizeContentType(contentType: string | null | undefined): string {
  if (!contentType) return "";
  return contentType
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isAllowedUploadContentType(contentType: string): boolean {
  return ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType);
}

function validateUploadRequestOrThrow(args: { fileSize: number; contentType: string }) {
  if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) {
    throw new Error("Video file size must be greater than zero.");
  }

  if (args.fileSize > MAX_PRESIGNED_PUT_FILE_SIZE_BYTES) {
    throw new Error("Video file is too large for direct upload.");
  }

  const normalizedContentType = normalizeContentType(args.contentType);
  if (!isAllowedUploadContentType(normalizedContentType)) {
    throw new Error("Unsupported video format. Allowed: mp4, mov, webm, mkv.");
  }

  return normalizedContentType;
}

function shouldDeleteUploadedObjectOnFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Unsupported video format") ||
    error.message.includes("Video file is too large") ||
    error.message.includes("Uploaded video file not found") ||
    error.message.includes("Storage limit reached")
  );
}

async function requireVideoMemberAccess(
  ctx: ActionCtx,
  videoId: Id<"videos">
) {
  const video = (await ctx.runQuery(api.videos.get, { videoId })) as
    | { role?: string }
    | null;
  if (!video || video.role === "viewer") {
    throw new Error("Requires member role or higher");
  }
}

function requireReadyPlaybackTarget(target: PlaybackTarget | null): PlaybackTarget {
  if (!target || target.status !== "ready") {
    throw new Error("Video not found or not ready");
  }

  return target;
}

function requireMuxAssetId(target: PlaybackTarget): string {
  if (!target.muxAssetId) {
    throw new Error("Video playback asset is not configured");
  }

  return target.muxAssetId;
}

async function setThumbnailUrl(
  ctx: ActionCtx,
  videoId: Id<"videos">,
  thumbnailUrl: string | null,
) {
  await ctx.runMutation(internal.videos.setThumbnailUrl, {
    videoId,
    thumbnailUrl,
  });
}

async function ensurePublicPlaybackIdForTarget(
  ctx: ActionCtx,
  target: PlaybackTarget,
): Promise<string> {
  const muxAssetId = requireMuxAssetId(target);
  const asset = await getMuxAsset(muxAssetId);
  const playbackIds = resolveMuxPlaybackIds(
    (asset.playback_ids ?? []) as Array<{ id?: string; policy?: string }>,
  );

  let publicPlaybackId = playbackIds.publicPlaybackId;
  if (!publicPlaybackId) {
    const created = await createPublicPlaybackId(muxAssetId);
    if (!created.id) {
      throw new Error("Mux did not return a public playback id");
    }
    publicPlaybackId = created.id;
  }

  const plan = planPublicPlaybackAccess({
    publicPlaybackId,
    target,
  });
  if (plan.thumbnailUrl !== undefined) {
    await setThumbnailUrl(ctx, target._id, plan.thumbnailUrl);
  }

  return publicPlaybackId;
}

async function ensureSignedPlaybackIdForTarget(
  ctx: ActionCtx,
  target: PlaybackTarget,
): Promise<string> {
  if (target.muxPlaybackId) {
    return target.muxPlaybackId;
  }

  const muxAssetId = requireMuxAssetId(target);
  const asset = await getMuxAsset(muxAssetId);
  const playbackIds = resolveMuxPlaybackIds(
    (asset.playback_ids ?? []) as Array<{ id?: string; policy?: string }>,
  );

  let signedPlaybackId = playbackIds.signedPlaybackId;
  if (!signedPlaybackId) {
    const created = await createSignedPlaybackId(muxAssetId);
    if (!created.id) {
      throw new Error("Mux did not return a signed playback id");
    }
    signedPlaybackId = created.id;
  }

  const plan = planSignedPlaybackAccess({
    publicPlaybackIds: playbackIds.publicPlaybackIds,
    signedPlaybackId,
    target,
  });

  if (plan.muxPlaybackId !== undefined) {
    await ctx.runMutation(internal.videos.setMuxPlaybackId, {
      videoId: target._id,
      muxPlaybackId: plan.muxPlaybackId,
    });
  }

  for (const publicPlaybackId of plan.publicPlaybackIdsToDelete) {
    try {
      await deletePlaybackId(muxAssetId, publicPlaybackId);
    } catch (error) {
      console.error("Failed to remove stale public playback id", {
        videoId: target._id,
        muxAssetId,
        publicPlaybackId,
        error,
      });
    }
  }

  if (plan.thumbnailUrl !== undefined) {
    await setThumbnailUrl(ctx, target._id, plan.thumbnailUrl);
  }

  return signedPlaybackId;
}

async function buildSignedMuxPlaybackSession(
  playbackId: string,
): Promise<PlaybackSession> {
  const [playbackToken, thumbnailToken] = await Promise.all([
    signPlaybackToken(playbackId, SIGNED_PLAYBACK_SESSION_TTL),
    signThumbnailToken(playbackId, SIGNED_PLAYBACK_SESSION_TTL),
  ]);

  return buildSignedPlaybackSession({
    playbackId,
    playbackToken,
    thumbnailToken,
  });
}

async function buildDownloadResponse(target: DownloadTarget): Promise<{
  filename: string;
  url: string;
}> {
  if (target.status !== "ready") {
    throw new Error("Video not found or not ready");
  }

  const key = getValueString(target, "s3Key");
  if (!key) {
    throw new Error("Original bucket file not found for this video");
  }

  const filename = buildDownloadFilename(target.title ?? undefined, key);

  return {
    filename,
    url: await buildSignedBucketObjectUrl(key, {
      expiresIn: 600,
      filename,
      contentType: target.contentType ?? "video/mp4",
    }),
  };
}

export const cleanupDeletedVideoAssets = internalAction({
  args: {
    videoId: v.optional(v.id("videos")),
    s3Key: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    if (args.s3Key) {
      try {
        const s3 = getS3Client();
        await s3.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: args.s3Key,
          }),
        );
      } catch (error) {
        console.error("Failed to delete S3 object for removed video", {
          videoId: args.videoId,
          reason: args.reason,
          s3Key: args.s3Key,
          error,
        });
      }
    }

    if (args.muxAssetId) {
      try {
        await deleteMuxAsset(args.muxAssetId);
      } catch (error) {
        console.error("Failed to delete Mux asset for removed video", {
          videoId: args.videoId,
          muxAssetId: args.muxAssetId,
          reason: args.reason,
          error,
        });
      }
    }

    return null;
  },
});

export const syncPlaybackAccessForVideo = internalAction({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.videos.getPlaybackTargetById, {
      videoId: args.videoId,
    });

    if (!target || target.status !== "ready") {
      return null;
    }

    await ensureSignedPlaybackIdForTarget(ctx, target);

    if (target.visibility === "public") {
      await ensurePublicPlaybackIdForTarget(ctx, target);
    }

    return null;
  },
});

export const getUploadUrl = action({
  args: {
    videoId: v.id("videos"),
    filename: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  returns: v.object({
    cleanupScheduled: v.boolean(),
    url: v.string(),
    uploadId: v.string(),
    uploadGeneration: v.number(),
    uploadSessionToken: v.string(),
  }),
  handler: async (ctx, args): Promise<GetUploadUrlResult> => {
    await requireVideoMemberAccess(ctx, args.videoId);
    const normalizedContentType = validateUploadRequestOrThrow({
      fileSize: args.fileSize,
      contentType: args.contentType,
    });

    const s3 = getS3Client();
    const ext = getExtensionFromKey(args.filename);
    const key = `videos/${args.videoId}/${Date.now()}-${generateOpaqueToken(16)}.${ext}`;
    const uploadSessionToken = generateOpaqueToken(24);
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: normalizedContentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    const result = await ctx.runMutation(internal.videos.setUploadInfo, {
      videoId: args.videoId,
      s3Key: key,
      fileSize: args.fileSize,
      contentType: normalizedContentType,
      uploadSessionToken,
    }) as {
      cleanupScheduled: boolean;
      uploadGeneration: number;
    };

    return {
      cleanupScheduled: result.cleanupScheduled,
      url,
      uploadGeneration: result.uploadGeneration,
      uploadId: key,
      uploadSessionToken,
    };
  },
});

export const markUploadComplete = action({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.string(),
  },
  returns: v.object({
    outcome: v.union(
      v.literal("already_processing"),
      v.literal("already_ready"),
      v.literal("started"),
      v.literal("stale"),
    ),
    success: v.boolean(),
  }),
  handler: async (ctx, args): Promise<MarkUploadCompleteResult> => {
    await requireVideoMemberAccess(ctx, args.videoId);

    const processing = await ctx.runMutation(internal.videos.markAsProcessing, {
      videoId: args.videoId,
      uploadSessionToken: args.uploadSessionToken,
    }) as
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
        };
    if (processing.outcome === "stale") {
      return { outcome: "stale", success: true };
    }
    if (processing.outcome === "already_processing") {
      return { outcome: "already_processing", success: true };
    }
    if (processing.outcome === "already_ready") {
      return { outcome: "already_ready", success: true };
    }
    if (processing.outcome === "retry_required") {
      throw new Error("Upload session is no longer pending. Request a new upload URL.");
    }
    if (processing.outcome === "missing_object") {
      throw new Error("Original bucket file not found for this video");
    }
    const activeProcessing = processing as {
      contentType?: string;
      outcome: "started";
      s3Key: string;
      uploadGeneration: number;
    };

    try {
      const s3 = getS3Client();
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: activeProcessing.s3Key,
        }),
      );
      const contentLengthRaw = head.ContentLength;
      if (
        typeof contentLengthRaw !== "number" ||
        !Number.isFinite(contentLengthRaw) ||
        contentLengthRaw <= 0
      ) {
        throw new Error("Uploaded video file not found or empty.");
      }
      const contentLength = contentLengthRaw;
      if (contentLength > MAX_PRESIGNED_PUT_FILE_SIZE_BYTES) {
        throw new Error("Video file is too large for direct upload.");
      }

      const normalizedContentType = normalizeContentType(
        head.ContentType ?? activeProcessing.contentType,
      );
      if (!isAllowedUploadContentType(normalizedContentType)) {
        throw new Error("Unsupported video format. Allowed: mp4, mov, webm, mkv.");
      }

      const reconciled = await ctx.runMutation(internal.videos.reconcileUploadedObjectMetadata, {
        videoId: args.videoId,
        fileSize: contentLength,
        contentType: normalizedContentType,
        uploadSessionToken: args.uploadSessionToken,
      }) as { applied: boolean };
      if (!reconciled.applied) {
        return { outcome: "stale", success: true };
      }

      const ingestUrl = await buildSignedBucketObjectUrl(activeProcessing.s3Key, {
        expiresIn: 60 * 60 * 24,
      });
      const asset = await createMuxAssetFromInputUrl(
        buildMuxUploadPassthrough(args.videoId, args.uploadSessionToken),
        ingestUrl,
      );
      if (asset.id) {
        const attached = await ctx.runMutation(internal.videos.setMuxAssetReference, {
          videoId: args.videoId,
          muxAssetId: asset.id,
          uploadSessionToken: args.uploadSessionToken,
        }) as { applied: boolean };
        if (!attached.applied) {
          await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
            videoId: args.videoId,
            muxAssetId: asset.id,
            reason: "stale_mux_asset_after_retry",
          });
          return { outcome: "stale", success: true };
        }
      }
    } catch (error) {
      const shouldDeleteObject = shouldDeleteUploadedObjectOnFailure(error);
      const uploadError =
        shouldDeleteObject && error instanceof Error
          ? error.message
          : "Mux ingest failed after upload.";
      const failed = await ctx.runMutation(internal.videos.markAsFailed, {
        videoId: args.videoId,
        uploadSessionToken: args.uploadSessionToken,
        uploadError,
        allowProcessingFailure: true,
      }) as {
        cleanupScheduled: boolean;
        outcome: "stale" | "ignored" | "already_failed" | "applied";
      };
      if (
        failed.outcome === "stale" ||
        failed.outcome === "ignored" ||
        failed.outcome === "already_failed"
      ) {
        return { outcome: "stale", success: true };
      }
      throw error;
    }

    return { outcome: "started", success: true };
  },
});

export const markUploadFailed = action({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.optional(v.string()),
  },
  returns: v.object({
    cleanupScheduled: v.boolean(),
    outcome: v.union(
      v.literal("already_failed"),
      v.literal("applied"),
      v.literal("ignored"),
      v.literal("stale"),
    ),
    success: v.boolean(),
  }),
  handler: async (ctx, args): Promise<MarkUploadFailedResult> => {
    await requireVideoMemberAccess(ctx, args.videoId);

    const result = await ctx.runMutation(internal.videos.markAsFailed, {
      videoId: args.videoId,
      uploadSessionToken: args.uploadSessionToken,
      uploadError: "Upload failed before Mux could process the asset.",
      allowProcessingFailure: false,
      allowLegacyWithoutSession: args.uploadSessionToken === undefined,
    }) as {
      cleanupScheduled: boolean;
      outcome: "stale" | "ignored" | "already_failed" | "applied";
    };

    return {
      cleanupScheduled: result.cleanupScheduled,
      outcome: result.outcome,
      success: true,
    };
  },
});

export const getPlaybackSession = action({
  args: { videoId: v.id("videos") },
  returns: playbackSessionValidator,
  handler: async (
    ctx,
    args,
  ): Promise<PlaybackSession> => {
    const target = requireReadyPlaybackTarget(await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    }) as PlaybackTarget | null);

    const playbackId = await ensureSignedPlaybackIdForTarget(ctx, target);
    return await buildSignedMuxPlaybackSession(playbackId);
  },
});

export const getPlaybackUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const target = requireReadyPlaybackTarget(await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    }) as PlaybackTarget | null);

    const playbackId = await ensureSignedPlaybackIdForTarget(ctx, target);
    const session = await buildSignedMuxPlaybackSession(playbackId);
    return { url: session.url };
  },
});

export const getOriginalPlaybackUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
    contentType: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; contentType: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });

    if (!video || !video.s3Key) {
      throw new Error("Original bucket file not found for this video");
    }

    const contentType = video.contentType ?? "video/mp4";
    return {
      url: await buildSignedBucketObjectUrl(video.s3Key, {
        expiresIn: 600,
        contentType,
      }),
      contentType,
    };
  },
});

export const getPublicPlaybackSession = action({
  args: { publicId: v.string() },
  returns: playbackSessionValidator,
  handler: async (
    ctx,
    args,
  ): Promise<PlaybackSession> => {
    const target = requireReadyPlaybackTarget(await ctx.runQuery(internal.videos.getPublicPlaybackTarget, {
      publicId: args.publicId,
    }) as PlaybackTarget | null);

    const playbackId = await ensurePublicPlaybackIdForTarget(ctx, target);
    return buildPublicPlaybackSession(playbackId);
  },
});

export const getPublicWatchBootstrap = action({
  args: { publicId: v.string() },
  returns: publicWatchBootstrapValidator,
  handler: async (ctx, args): Promise<PublicWatchBootstrap> => {
    const videoData: PublicVideoData | null = await ctx.runQuery(api.videos.getByPublicId, {
      publicId: args.publicId,
    });

    if (!videoData?.video) {
      return { state: "missing" as const };
    }

    const target = requireReadyPlaybackTarget(await ctx.runQuery(internal.videos.getPublicPlaybackTarget, {
      publicId: args.publicId,
    }) as PlaybackTarget | null);

    const playbackId = await ensurePublicPlaybackIdForTarget(ctx, target);

    return {
      state: "ready" as const,
      playbackSession: buildPublicPlaybackSession(playbackId),
      videoData,
    };
  },
});

export const getSharedPlaybackSession = action({
  args: { grantToken: v.string() },
  returns: playbackSessionValidator,
  handler: async (
    ctx,
    args,
  ): Promise<PlaybackSession> => {
    const target = requireReadyPlaybackTarget(await ctx.runQuery(internal.videos.getShareGrantPlaybackTarget, {
      grantToken: args.grantToken,
    }) as PlaybackTarget | null);

    const playbackId = await ensureSignedPlaybackIdForTarget(ctx, target);
    return await buildSignedMuxPlaybackSession(playbackId);
  },
});

export const getSharePlaybackBootstrap = action({
  args: {
    token: v.string(),
    password: v.optional(v.string()),
  },
  returns: sharePlaybackBootstrapValidator,
  handler: async (ctx, args): Promise<SharePlaybackBootstrap> => {
    const shareInfo = await ctx.runQuery(api.shareLinks.getByToken, {
      token: args.token,
    });

    if (shareInfo.status === "missing") {
      return { state: "missing" as const };
    }

    if (shareInfo.status === "expired") {
      return { state: "expired" as const };
    }

    if (shareInfo.status === "processing") {
      return { state: "processing" as const };
    }

    if (shareInfo.status === "failed") {
      return { state: "failed" as const };
    }

    if (shareInfo.status === "requiresPassword" && !args.password) {
      return { state: "passwordRequired" as const };
    }

    const grant: ShareAccessGrantResult = await ctx.runMutation(api.shareLinks.issueAccessGrant, {
      password: args.password,
      token: args.token,
    });

    if (!grant.ok || !grant.grantToken) {
      return mapShareGrantFailureToBootstrap(grant.failureReason, {
        passwordProvided: Boolean(args.password),
        retryAfterSeconds: grant.retryAfterSeconds,
      });
    }

    const videoData: ShareVideoData | null = await ctx.runQuery(api.videos.getByShareGrant, {
      grantToken: grant.grantToken,
    });

    if (!videoData?.video) {
      return { state: "missing" as const };
    }

    const target = requireReadyPlaybackTarget(await ctx.runQuery(internal.videos.getShareGrantPlaybackTarget, {
      grantToken: grant.grantToken,
    }) as PlaybackTarget | null);

    const playbackId = await ensureSignedPlaybackIdForTarget(ctx, target);

    return {
      state: "ready" as const,
      grantToken: grant.grantToken,
      playbackSession: await buildSignedMuxPlaybackSession(playbackId),
      videoData,
    };
  },
});

export const getSharedDownloadUrl = action({
  args: { grantToken: v.string() },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
  }),
  handler: async (ctx, args): Promise<{ filename: string; url: string }> => {
    const target = await ctx.runQuery(internal.videos.getShareGrantDownloadTarget, {
      grantToken: args.grantToken,
    });

    if (!target) {
      throw new Error("Video not found");
    }

    if (!target.allowDownload) {
      throw new Error("Downloads are disabled for this share link");
    }

    return await buildDownloadResponse(target);
  },
});

export const getDownloadUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; filename: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });

    if (!video) {
      throw new Error("Video not found");
    }

    return await buildDownloadResponse(video);
  },
});
