import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getUser,
  requireTeamAccess,
  requireProjectAccess,
} from "./auth";
import { assertTeamHasActiveSubscription } from "./billingHelpers";
import { getGrantedVideoIdsForTeamUser } from "./videoMemberGrantHelpers";
import {
  LIST_ITEM_CAP,
  capRawPage,
  capScannedCount,
  collectAccessibleVideosForProjectUpToCap,
  logCappedList,
} from "./listCaps";

export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "member");
    await assertTeamHasActiveSubscription(ctx, args.teamId);

    return await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      description: args.description,
    });
  },
});

export const list = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const { membership } = await requireTeamAccess(ctx, args.teamId);
    const grantedVideoIds = await getGrantedVideoIdsForTeamUser(ctx, {
      teamId: args.teamId,
      userClerkId: membership.userClerkId,
    });

    // Projects have no per-item ACL beyond team membership (already checked
    // by requireTeamAccess), so the raw read is capped directly with
    // .take(cap + 1) — the upstream 62c0463 pattern. Truncation is logged,
    // never silent.
    const projectPage = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(LIST_ITEM_CAP + 1);
    const { items: projects, hasMore } = capRawPage(projectPage);
    if (hasMore) {
      logCappedList("projects.list", {
        teamId: args.teamId,
        kept: projects.length,
        droppedAtLeast: projectPage.length - LIST_ITEM_CAP,
        cap: LIST_ITEM_CAP,
      });
    }

    // Accessible video count per project. The count is capped AFTER the ACL
    // filter (upstream aaf96d8 flags this as videoCountIsCapped): the scan
    // stops once LIST_ITEM_CAP + 1 accessible videos are found, so restricted
    // videos the caller cannot access do not shrink the count.
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const accessible = await collectAccessibleVideosForProjectUpToCap(ctx, {
          projectId: project._id,
          grantedVideoIds,
          membership,
        });
        const { count: videoCount, isCapped: videoCountIsCapped } =
          capScannedCount(accessible.accepted.length);

        return {
          ...project,
          videoCount,
          videoCountIsCapped,
        };
      })
    );

    return projectsWithCounts;
  },
});

export const listUploadTargets = query({
  args: {
    teamSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return [];

    // Bounded reads for the upload picker. Neither scan has a per-item ACL
    // (the role filter runs after the membership read, and projects have no
    // per-item ACL), so the raw reads are capped with .take(cap + 1) — the
    // upstream 62c0463 pattern. Truncation is logged, never silent.
    const membershipPage = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .take(LIST_ITEM_CAP + 1);
    const { items: memberships, hasMore: membershipsCapped } =
      capRawPage(membershipPage);
    if (membershipsCapped) {
      logCappedList("projects.listUploadTargets", {
        userClerkId: user.subject,
        kept: memberships.length,
        droppedAtLeast: membershipPage.length - LIST_ITEM_CAP,
        cap: LIST_ITEM_CAP,
      });
    }

    const uploadableMemberships = memberships.filter(
      (membership) => membership.role !== "viewer",
    );

    const targets = await Promise.all(
      uploadableMemberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        if (!team) return [];
        if (args.teamSlug && team.slug !== args.teamSlug) return [];

        const projectPage = await ctx.db
          .query("projects")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .take(LIST_ITEM_CAP + 1);
        const { items: projects, hasMore } = capRawPage(projectPage);
        if (hasMore) {
          logCappedList("projects.listUploadTargets", {
            teamId: team._id,
            kept: projects.length,
            droppedAtLeast: projectPage.length - LIST_ITEM_CAP,
            cap: LIST_ITEM_CAP,
          });
        }

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

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    return { ...project, role: membership.role };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const updates: Partial<{ name: string; description: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.projectId, updates);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "admin");

    // Delete all videos in the project
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const video of videos) {
      if (video.s3Key || video.muxAssetId) {
        await ctx.scheduler.runAfter(0, internal.videoActions.cleanupDeletedVideoAssets, {
          videoId: video._id,
          s3Key: video.s3Key,
          muxAssetId: video.muxAssetId,
        });
      }

      // Delete comments
      const comments = await ctx.db
        .query("comments")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }

      // Delete reactions
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const reaction of reactions) {
        await ctx.db.delete(reaction._id);
      }

      // Delete watch events
      const watchEvents = await ctx.db
        .query("videoWatchEvents")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const watchEvent of watchEvents) {
        await ctx.db.delete(watchEvent._id);
      }

      // Delete share links
      const shareLinks = await ctx.db
        .query("shareLinks")
        .withIndex("by_video", (q) => q.eq("videoId", video._id))
        .collect();
      for (const link of shareLinks) {
        const grants = await ctx.db
          .query("shareAccessGrants")
          .withIndex("by_share_link", (q) => q.eq("shareLinkId", link._id))
          .collect();
        for (const grant of grants) {
          await ctx.db.delete(grant._id);
        }
        await ctx.db.delete(link._id);
      }

      await ctx.db.delete(video._id);
    }

    await ctx.db.delete(args.projectId);
  },
});
