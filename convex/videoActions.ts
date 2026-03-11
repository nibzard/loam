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
import { BUCKET_NAME, getS3Client } from "./s3";
import { generateOpaqueToken } from "./security";

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

type PlaybackTarget = {
  _id: Id<"videos">;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl?: string | null;
  visibility: "public" | "private";
};

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
    publicPlaybackId = created.id;
  }

  const session = buildPublicPlaybackSession(publicPlaybackId);
  if (target.visibility === "public" && target.thumbnailUrl !== session.posterUrl) {
    await setThumbnailUrl(ctx, target._id, session.posterUrl);
  }

  return publicPlaybackId;
}

async function ensureSignedPlaybackIdForTarget(
  ctx: ActionCtx,
  target: PlaybackTarget,
): Promise<string> {
  const muxAssetId = requireMuxAssetId(target);
  const asset = await getMuxAsset(muxAssetId);
  const playbackIds = resolveMuxPlaybackIds(
    (asset.playback_ids ?? []) as Array<{ id?: string; policy?: string }>,
  );

  const signedPlaybackId = playbackIds.signedPlaybackId;
  if (!signedPlaybackId) {
    throw new Error("Signed playback is not configured for this video");
  }

  if (signedPlaybackId !== target.muxPlaybackId) {
    await ctx.runMutation(internal.videos.setMuxPlaybackId, {
      videoId: target._id,
      muxPlaybackId: signedPlaybackId,
    });
  }

  if (target.visibility === "private") {
    for (const publicPlaybackId of playbackIds.publicPlaybackIds) {
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

    if (target.thumbnailUrl) {
      await setThumbnailUrl(ctx, target._id, null);
    }
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

export const cleanupDeletedVideoAssets = internalAction({
  args: {
    videoId: v.optional(v.id("videos")),
    s3Key: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
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
    url: v.string(),
    uploadId: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);
    const normalizedContentType = validateUploadRequestOrThrow({
      fileSize: args.fileSize,
      contentType: args.contentType,
    });

    const s3 = getS3Client();
    const ext = getExtensionFromKey(args.filename);
    const key = `videos/${args.videoId}/${Date.now()}-${generateOpaqueToken(16)}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: normalizedContentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    await ctx.runMutation(internal.videos.setUploadInfo, {
      videoId: args.videoId,
      s3Key: key,
      fileSize: args.fileSize,
      contentType: normalizedContentType,
    });

    return { url, uploadId: key };
  },
});

export const markUploadComplete = action({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);

    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });

    if (!video || !video.s3Key) {
      throw new Error("Original bucket file not found for this video");
    }

    try {
      const s3 = getS3Client();
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: video.s3Key,
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
        head.ContentType ?? video.contentType,
      );
      if (!isAllowedUploadContentType(normalizedContentType)) {
        throw new Error("Unsupported video format. Allowed: mp4, mov, webm, mkv.");
      }

      await ctx.runMutation(internal.videos.reconcileUploadedObjectMetadata, {
        videoId: args.videoId,
        fileSize: contentLength,
        contentType: normalizedContentType,
      });

      await ctx.runMutation(internal.videos.markAsProcessing, {
        videoId: args.videoId,
      });

      const ingestUrl = await buildSignedBucketObjectUrl(video.s3Key, {
        expiresIn: 60 * 60 * 24,
      });
      const asset = await createMuxAssetFromInputUrl(args.videoId, ingestUrl);
      if (asset.id) {
        await ctx.runMutation(internal.videos.setMuxAssetReference, {
          videoId: args.videoId,
          muxAssetId: asset.id,
        });
      }
    } catch (error) {
      const shouldDeleteObject = shouldDeleteUploadedObjectOnFailure(error);
      if (shouldDeleteObject) {
        const s3 = getS3Client();
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: video.s3Key,
            }),
          );
        } catch {
          // No-op: preserve original processing failure.
        }
      }

      const uploadError =
        shouldDeleteObject && error instanceof Error
          ? error.message
          : "Mux ingest failed after upload.";
      await ctx.runMutation(internal.videos.markAsFailed, {
        videoId: args.videoId,
        uploadError,
      });
      throw error;
    }

    return { success: true };
  },
});

export const markUploadFailed = action({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);

    await ctx.runMutation(internal.videos.markAsFailed, {
      videoId: args.videoId,
      uploadError: "Upload failed before Mux could process the asset.",
    });

    return { success: true };
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

    if (video.status !== "ready") {
      throw new Error("Video not found or not ready");
    }

    const key = getValueString(video, "s3Key");
    if (!key) {
      throw new Error("Original bucket file not found for this video");
    }

    const filename = buildDownloadFilename(video.title, key);

    return {
      url: await buildSignedBucketObjectUrl(key, {
        expiresIn: 600,
        filename,
        contentType: video.contentType ?? "video/mp4",
      }),
      filename,
    };
  },
});
