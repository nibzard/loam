import { v } from "convex/values";
import {
  getCurrentBillingMonthKey,
  getTeamSubscriptionState,
  TEAM_PLAN_MEMBER_WATCH_MINUTES_LIMIT,
  TEAM_PLAN_SHARED_LINK_WATCH_MINUTES_LIMIT,
} from "./billingHelpers";
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

type RecordWatchEventResult = {
  recorded: boolean;
  capReached: boolean;
  consumedWatchSeconds: number;
  isFirstWatch: boolean;
  watchedAt: number;
  viewerLabel: string;
  videoTitle: string;
  videoPublicId: string;
  uploaderClerkId: string;
  uploaderEmail: string | null;
};

function normalizeString(input: string, maxLength: number) {
  return input.trim().slice(0, maxLength);
}

type UsageRowLike<TId = unknown> = {
  _id: TId;
  memberWatchSeconds: number;
  sharedWatchSeconds: number;
};

export function planUsageCompaction<T extends UsageRowLike>(usageRows: T[]) {
  if (usageRows.length === 0) return null;

  const [primary, ...duplicates] = usageRows;
  const totals = usageRows.reduce(
    (acc, row) => ({
      memberWatchSeconds: acc.memberWatchSeconds + row.memberWatchSeconds,
      sharedWatchSeconds: acc.sharedWatchSeconds + row.sharedWatchSeconds,
    }),
    { memberWatchSeconds: 0, sharedWatchSeconds: 0 },
  );

  return {
    primary,
    duplicateIds: duplicates.map((row) => row._id) as Array<T["_id"]>,
    memberWatchSeconds: totals.memberWatchSeconds,
    sharedWatchSeconds: totals.sharedWatchSeconds,
    hasDuplicates: duplicates.length > 0,
  };
}

export const recordWatchEvent = internalMutation({
  args: {
    videoId: v.id("videos"),
    fingerprint: v.string(),
    viewerKind: viewerKindValidator,
    viewerLabel: v.string(),
    viewerSubject: v.optional(v.string()),
    source: watchSourceValidator,
    watchedSeconds: v.number(),
  },
  returns: v.object({
    recorded: v.boolean(),
    capReached: v.boolean(),
    consumedWatchSeconds: v.number(),
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
    const project = await ctx.db.get(video.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const fingerprint = normalizeString(args.fingerprint, 128);
    if (!fingerprint) {
      throw new Error("Missing watch fingerprint");
    }

    const viewerLabel = normalizeString(args.viewerLabel, 120) || "Viewer";
    const now = Date.now();
    const requestedWatchSeconds =
      Number.isFinite(args.watchedSeconds) && args.watchedSeconds > 0
        ? Math.floor(args.watchedSeconds)
        : 0;

    let resolvedViewerKind = args.viewerKind;
    if (resolvedViewerKind === "member" && args.viewerSubject) {
      const viewerSubject = args.viewerSubject;
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_and_user", (q) =>
          q.eq("teamId", project.teamId).eq("userClerkId", viewerSubject),
        )
        .unique();

      if (!membership) {
        resolvedViewerKind = "guest";
      }
    }

    let capReached = false;
    let consumedWatchSeconds = 0;
    if (requestedWatchSeconds > 0) {
      const subscriptionState = await getTeamSubscriptionState(ctx, project.teamId);
      const monthKey = getCurrentBillingMonthKey(new Date());
      const usageRows = await ctx.db
        .query("teamWatchUsage")
        .withIndex("by_team_and_month", (q) =>
          q.eq("teamId", project.teamId).eq("monthKey", monthKey),
        )
        .collect();

      const compactedUsage = planUsageCompaction(usageRows);
      let usage = null;
      if (compactedUsage) {
        if (compactedUsage.hasDuplicates) {
          // Defensive compaction keeps quota math consistent if duplicate rows were created.
          await ctx.db.patch(compactedUsage.primary._id, {
            memberWatchSeconds: compactedUsage.memberWatchSeconds,
            sharedWatchSeconds: compactedUsage.sharedWatchSeconds,
            updatedAt: now,
          });
          for (const duplicateId of compactedUsage.duplicateIds) {
            await ctx.db.delete(duplicateId);
          }
        }

        usage = {
          ...compactedUsage.primary,
          memberWatchSeconds: compactedUsage.memberWatchSeconds,
          sharedWatchSeconds: compactedUsage.sharedWatchSeconds,
        };
      }

      const limitMinutes =
        resolvedViewerKind === "member"
          ? TEAM_PLAN_MEMBER_WATCH_MINUTES_LIMIT[subscriptionState.plan]
          : TEAM_PLAN_SHARED_LINK_WATCH_MINUTES_LIMIT[subscriptionState.plan];
      const limitSeconds = limitMinutes * 60;
      const usedSeconds =
        resolvedViewerKind === "member"
          ? usage?.memberWatchSeconds ?? 0
          : usage?.sharedWatchSeconds ?? 0;
      const remainingSeconds = Math.max(limitSeconds - usedSeconds, 0);

      consumedWatchSeconds = Math.min(requestedWatchSeconds, remainingSeconds);
      if (consumedWatchSeconds < requestedWatchSeconds) {
        capReached = true;
      }

      if (consumedWatchSeconds > 0) {
        if (usage) {
          await ctx.db.patch(usage._id, {
            updatedAt: now,
            memberWatchSeconds:
              resolvedViewerKind === "member"
                ? usage.memberWatchSeconds + consumedWatchSeconds
                : usage.memberWatchSeconds,
            sharedWatchSeconds:
              resolvedViewerKind === "guest"
                ? usage.sharedWatchSeconds + consumedWatchSeconds
                : usage.sharedWatchSeconds,
          });
        } else {
          await ctx.db.insert("teamWatchUsage", {
            teamId: project.teamId,
            monthKey,
            memberWatchSeconds:
              resolvedViewerKind === "member" ? consumedWatchSeconds : 0,
            sharedWatchSeconds:
              resolvedViewerKind === "guest" ? consumedWatchSeconds : 0,
            updatedAt: now,
          });
        }
      }
    }

    if (requestedWatchSeconds > 0 && consumedWatchSeconds <= 0) {
      return {
        recorded: false,
        capReached,
        consumedWatchSeconds,
        isFirstWatch: false,
        watchedAt: now,
        viewerLabel,
        videoTitle: video.title,
        videoPublicId: video.publicId,
        uploaderClerkId: video.uploadedByClerkId,
        uploaderEmail: null,
      };
    }

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
        watchSeconds: existing.watchSeconds + consumedWatchSeconds,
        viewerLabel,
        viewerKind: resolvedViewerKind,
      });
    } else {
      await ctx.db.insert("videoWatchEvents", {
        videoId: args.videoId,
        fingerprint,
        viewerKind: resolvedViewerKind,
        viewerLabel,
        source: args.source,
        firstWatchedAt: now,
        lastWatchedAt: now,
        watchCount: 1,
        watchSeconds: consumedWatchSeconds,
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

    const result: RecordWatchEventResult = {
      recorded: true,
      capReached,
      consumedWatchSeconds,
      isFirstWatch,
      watchedAt: now,
      viewerLabel,
      videoTitle: video.title,
      videoPublicId: video.publicId,
      uploaderClerkId: video.uploadedByClerkId,
      uploaderEmail,
    };
    return result;
  },
});
