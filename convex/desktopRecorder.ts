import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, query, ActionCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getUser } from "./auth";

function resolveSiteUrl() {
  const raw = process.env.VITE_CONVEX_SITE_URL || process.env.APP_SITE_URL;
  if (!raw) return null;

  try {
    const normalized = raw.trim();
    if (!normalized) return null;

    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

function buildAbsoluteUrl(path: string) {
  const siteUrl = resolveSiteUrl();
  return siteUrl ? `${siteUrl}${path}` : path;
}

async function getReusableShareToken(
  ctx: ActionCtx,
  videoId: Id<"videos">,
) {
  const links = await ctx.runQuery(api.shareLinks.list, { videoId }) as Array<{
    token: string;
    hasPassword: boolean;
    isExpired: boolean;
    _creationTime: number;
  }>;

  const reusableLink = links
    .filter((link) => !link.hasPassword && !link.isExpired)
    .sort((a, b) => b._creationTime - a._creationTime)[0];

  if (reusableLink) {
    return reusableLink.token;
  }

  const created = await ctx.runMutation(api.shareLinks.create, {
    videoId,
    allowDownload: false,
  });
  return created.token;
}

export const listUploadTargets = query({
  args: {
    teamSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .collect();

    const uploadableMemberships = memberships.filter(
      (membership) => membership.role !== "viewer",
    );

    const targets = await Promise.all(
      uploadableMemberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        if (!team) return [];
        if (args.teamSlug && team.slug !== args.teamSlug) return [];

        const projects = await ctx.db
          .query("projects")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();

        return projects.map((project) => ({
          projectId: project._id,
          projectName: project.name,
          teamId: team._id,
          teamName: team.name,
          teamSlug: team.slug,
          role: membership.role,
        }));
      }),
    );

    return targets
      .flat()
      .sort((a, b) =>
        a.teamName.localeCompare(b.teamName) ||
        a.projectName.localeCompare(b.projectName),
      );
  },
});

export const prepareUpload = action({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  returns: v.object({
    videoId: v.id("videos"),
    publicId: v.string(),
    uploadKey: v.string(),
    uploadSessionToken: v.string(),
    uploadUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const created = await ctx.runMutation(api.videos.create, {
      projectId: args.projectId,
      title: args.title,
      fileSize: args.fileSize,
      contentType: args.contentType,
    });

    const upload = await ctx.runAction(api.videoActions.getUploadUrl, {
      videoId: created.videoId,
      filename: `${args.title}.mp4`,
      fileSize: args.fileSize,
      contentType: args.contentType,
    });

    return {
      videoId: created.videoId,
      publicId: created.publicId,
      uploadKey: upload.uploadId,
      uploadSessionToken: upload.uploadSessionToken,
      uploadUrl: upload.url,
    };
  },
});

export const completeUpload = action({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.optional(v.string()),
  },
  returns: v.object({
    videoId: v.id("videos"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    shareUrl: v.string(),
    canonicalDashboardUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    let uploadSessionToken = args.uploadSessionToken;

    if (!uploadSessionToken) {
      const video = await ctx.runQuery(api.videos.get, { videoId: args.videoId }) as
        | (Doc<"videos"> & { role: string })
        | null;
      if (!video?.uploadSessionToken) {
        throw new Error("Upload session is missing for this video.");
      }
      uploadSessionToken = video.uploadSessionToken;
    }

    await ctx.runAction(api.videoActions.markUploadComplete, {
      videoId: args.videoId,
      uploadSessionToken,
    });

    const [video, context, shareToken] = await Promise.all([
      ctx.runQuery(api.videos.get, { videoId: args.videoId }) as Promise<
        (Doc<"videos"> & { role: string }) | null
      >,
      ctx.runQuery(api.workspace.resolveContext, { videoId: args.videoId }),
      getReusableShareToken(ctx, args.videoId),
    ]);

    if (!video) {
      throw new Error("Video not found after upload completion.");
    }

    if (!context) {
      throw new Error("Workspace context is unavailable for this video.");
    }

    return {
      videoId: args.videoId,
      status: video.status,
      shareUrl: buildAbsoluteUrl(`/share/${shareToken}`),
      canonicalDashboardUrl: buildAbsoluteUrl(context.canonicalPath),
    };
  },
});

export const failUpload = action({
  args: {
    videoId: v.id("videos"),
    uploadSessionToken: v.optional(v.string()),
    message: v.optional(v.string()),
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
  handler: async (ctx, args) => {
    const failure = await ctx.runAction(api.videoActions.markUploadFailed, {
      videoId: args.videoId,
      uploadSessionToken: args.uploadSessionToken,
    });

    if (args.message && failure.outcome === "applied") {
      console.error("Desktop upload failed", {
        videoId: args.videoId,
        message: args.message,
      });
    }

    return failure;
  },
});
