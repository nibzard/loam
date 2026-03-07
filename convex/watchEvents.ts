import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const viewerKindValidator = v.union(
  v.literal("member"),
  v.literal("guest"),
);

const watchSourceValidator = v.union(
  v.literal("dashboard"),
  v.literal("public"),
  v.literal("share"),
);

function normalizeString(input: string, maxLength: number) {
  return input.trim().slice(0, maxLength);
}

export const recordWatchEvent = internalMutation({
  args: {
    videoId: v.id("videos"),
    fingerprint: v.string(),
    viewerKind: viewerKindValidator,
    viewerLabel: v.string(),
    source: watchSourceValidator,
  },
  returns: v.object({
    isFirstWatch: v.boolean(),
    watchedAt: v.number(),
    viewerLabel: v.string(),
    videoTitle: v.string(),
    videoPublicId: v.string(),
    uploaderClerkId: v.string(),
    uploaderEmail: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const video = await ctx.db.get(args.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const fingerprint = normalizeString(args.fingerprint, 128);
    if (!fingerprint) {
      throw new Error("Missing watch fingerprint");
    }

    const viewerLabel = normalizeString(args.viewerLabel, 120) || "Viewer";
    const now = Date.now();

    const existing = await ctx.db
      .query("videoWatchEvents")
      .withIndex("by_video_and_fingerprint", (q) =>
        q.eq("videoId", args.videoId).eq("fingerprint", fingerprint),
      )
      .unique();

    const isFirstWatch = !existing;
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastWatchedAt: now,
        watchCount: existing.watchCount + 1,
        source: args.source,
        viewerLabel,
        viewerKind: args.viewerKind,
      });
    } else {
      await ctx.db.insert("videoWatchEvents", {
        videoId: args.videoId,
        fingerprint,
        viewerKind: args.viewerKind,
        viewerLabel,
        source: args.source,
        firstWatchedAt: now,
        lastWatchedAt: now,
        watchCount: 1,
      });
    }

    let uploaderEmail = video.uploaderEmail ?? null;
    if (!uploaderEmail) {
      const project = await ctx.db.get(video.projectId);
      if (project) {
        const member = await ctx.db
          .query("teamMembers")
          .withIndex("by_team_and_user", (q) =>
            q
              .eq("teamId", project.teamId)
              .eq("userClerkId", video.uploadedByClerkId),
          )
          .unique();
        if (member?.userEmail) {
          uploaderEmail = member.userEmail;
        }
      }
    }

    return {
      isFirstWatch,
      watchedAt: now,
      viewerLabel,
      videoTitle: video.title,
      videoPublicId: video.publicId,
      uploaderClerkId: video.uploadedByClerkId,
      uploaderEmail,
    };
  },
});
