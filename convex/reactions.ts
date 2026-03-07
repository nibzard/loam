import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import {
  identityAvatarUrl,
  identityName,
  requireUser,
  requireVideoAccess,
} from "./auth";
import { resolveActiveShareGrant } from "./shareAccess";

const ALLOWED_REACTIONS = new Set([
  "👍",
  "❤️",
  "😂",
  "🎉",
  "😮",
  "🔥",
]);

function normalizeReaction(emoji: string) {
  const normalized = emoji.trim();
  if (!ALLOWED_REACTIONS.has(normalized)) {
    throw new Error("Unsupported reaction");
  }
  return normalized;
}

async function getPublicVideoByPublicId(
  ctx: QueryCtx | MutationCtx,
  publicId: string,
) {
  const video = await ctx.db
    .query("videos")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique();

  if (!video || video.visibility !== "public" || video.status !== "ready") {
    return null;
  }

  return video;
}

export const list = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await requireVideoAccess(ctx, args.videoId, "viewer");

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_video", (q) => q.eq("videoId", args.videoId))
      .collect();

    return reactions.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const create = mutation({
  args: {
    videoId: v.id("videos"),
    emoji: v.string(),
    timestampSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireVideoAccess(ctx, args.videoId, "viewer");
    const emoji = normalizeReaction(args.emoji);

    return await ctx.db.insert("reactions", {
      videoId: args.videoId,
      userClerkId: user.subject,
      userName: identityName(user),
      userAvatarUrl: identityAvatarUrl(user),
      emoji,
      timestampSeconds: Math.max(0, args.timestampSeconds),
    });
  },
});

export const listForPublic = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const video = await getPublicVideoByPublicId(ctx, args.publicId);
    if (!video) return [];

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_video", (q) => q.eq("videoId", video._id))
      .collect();

    return reactions.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const createForPublic = mutation({
  args: {
    publicId: v.string(),
    emoji: v.string(),
    timestampSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const video = await getPublicVideoByPublicId(ctx, args.publicId);
    if (!video) throw new Error("Video not found");

    const emoji = normalizeReaction(args.emoji);
    return await ctx.db.insert("reactions", {
      videoId: video._id,
      userClerkId: user.subject,
      userName: identityName(user),
      userAvatarUrl: identityAvatarUrl(user),
      emoji,
      timestampSeconds: Math.max(0, args.timestampSeconds),
    });
  },
});

export const listForShareGrant = query({
  args: { grantToken: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) return [];

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") return [];

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_video", (q) => q.eq("videoId", video._id))
      .collect();

    return reactions.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const createForShareGrant = mutation({
  args: {
    grantToken: v.string(),
    emoji: v.string(),
    timestampSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const resolved = await resolveActiveShareGrant(ctx, args.grantToken);
    if (!resolved) throw new Error("Invalid share grant");

    const video = await ctx.db.get(resolved.shareLink.videoId);
    if (!video || video.status !== "ready") {
      throw new Error("Video not found");
    }

    const emoji = normalizeReaction(args.emoji);
    return await ctx.db.insert("reactions", {
      videoId: video._id,
      userClerkId: user.subject,
      userName: identityName(user),
      userAvatarUrl: identityAvatarUrl(user),
      emoji,
      timestampSeconds: Math.max(0, args.timestampSeconds),
    });
  },
});
