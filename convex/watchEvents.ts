import { v } from "convex/values";
import {
  getCurrentBillingMonthKey,
  getTeamSubscriptionState,
  TEAM_PLAN_MEMBER_WATCH_MINUTES_LIMIT,
  TEAM_PLAN_SHARED_LINK_WATCH_MINUTES_LIMIT,
} from "./billingHelpers";
import { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";

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
  usageKind: "member" | "shared";
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
  updatedAt?: number;
};

export function planUsageCompaction<T extends UsageRowLike>(usageRows: T[]) {
  if (usageRows.length === 0) return null;

  const [primary, ...duplicates] = usageRows;
  const totals = usageRows.reduce(
    (acc, row) => ({
      memberWatchSeconds: acc.memberWatchSeconds + row.memberWatchSeconds,
      sharedWatchSeconds: acc.sharedWatchSeconds + row.sharedWatchSeconds,
      updatedAt: Math.max(acc.updatedAt, row.updatedAt ?? 0),
    }),
    { memberWatchSeconds: 0, sharedWatchSeconds: 0, updatedAt: 0 },
  );

  return {
    primary,
    duplicateIds: duplicates.map((row) => row._id) as Array<T["_id"]>,
    memberWatchSeconds: totals.memberWatchSeconds,
    sharedWatchSeconds: totals.sharedWatchSeconds,
    updatedAt: totals.updatedAt,
    hasDuplicates: duplicates.length > 0,
  };
}

type WatchUsageKind = "member" | "shared";

type CanonicalWatchUsageTeamState = {
  currentWatchUsageMonthKey?: string;
  currentMemberWatchSeconds?: number;
  currentSharedWatchSeconds?: number;
  currentWatchUsageUpdatedAt?: number;
};

type CanonicalWatchUsageSnapshot = {
  monthKey: string;
  memberWatchSeconds: number;
  sharedWatchSeconds: number;
  updatedAt: number;
};

function normalizeStoredWatchSeconds(value: number | undefined | null) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function normalizeStoredTimestamp(value: number | undefined | null, fallback: number) {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return fallback;
  return Math.floor(value ?? fallback);
}

export function resolveCanonicalWatchUsageState(args: {
  team: CanonicalWatchUsageTeamState;
  currentMonthKey: string;
  legacyCurrentMonthUsage: Pick<
    CanonicalWatchUsageSnapshot,
    "memberWatchSeconds" | "sharedWatchSeconds"
  > | null;
  now: number;
}) {
  const teamMonthKey =
    typeof args.team.currentWatchUsageMonthKey === "string" &&
    args.team.currentWatchUsageMonthKey.length > 0
      ? args.team.currentWatchUsageMonthKey
      : null;

  const existingTeamSnapshot = teamMonthKey
    ? {
        monthKey: teamMonthKey,
        memberWatchSeconds: normalizeStoredWatchSeconds(
          args.team.currentMemberWatchSeconds,
        ),
        sharedWatchSeconds: normalizeStoredWatchSeconds(
          args.team.currentSharedWatchSeconds,
        ),
        updatedAt: normalizeStoredTimestamp(
          args.team.currentWatchUsageUpdatedAt,
          args.now,
        ),
      }
    : null;

  if (existingTeamSnapshot?.monthKey === args.currentMonthKey) {
    return {
      currentUsage: existingTeamSnapshot,
      previousUsageToArchive: null,
      shouldBootstrapFromLegacyCurrentMonth: false,
    };
  }

  return {
    currentUsage: {
      monthKey: args.currentMonthKey,
      memberWatchSeconds:
        args.legacyCurrentMonthUsage?.memberWatchSeconds ?? 0,
      sharedWatchSeconds:
        args.legacyCurrentMonthUsage?.sharedWatchSeconds ?? 0,
      updatedAt: args.now,
    },
    previousUsageToArchive:
      existingTeamSnapshot &&
      (existingTeamSnapshot.memberWatchSeconds > 0 ||
        existingTeamSnapshot.sharedWatchSeconds > 0)
        ? existingTeamSnapshot
        : null,
    shouldBootstrapFromLegacyCurrentMonth: true,
  };
}

export function planWatchUsageUpdate(args: {
  usage: CanonicalWatchUsageSnapshot;
  usageKind: WatchUsageKind;
  requestedWatchSeconds: number;
  limitSeconds: number;
  updatedAt: number;
}) {
  const usedSeconds =
    args.usageKind === "member"
      ? args.usage.memberWatchSeconds
      : args.usage.sharedWatchSeconds;
  const remainingSeconds = Math.max(args.limitSeconds - usedSeconds, 0);
  const consumedWatchSeconds = Math.min(
    args.requestedWatchSeconds,
    remainingSeconds,
  );
  const capReached = consumedWatchSeconds < args.requestedWatchSeconds;

  return {
    remainingSeconds,
    consumedWatchSeconds,
    capReached,
    nextUsage: {
      ...args.usage,
      updatedAt: args.updatedAt,
      memberWatchSeconds:
        args.usage.memberWatchSeconds +
        (args.usageKind === "member" ? consumedWatchSeconds : 0),
      sharedWatchSeconds:
        args.usage.sharedWatchSeconds +
        (args.usageKind === "shared" ? consumedWatchSeconds : 0),
    },
  };
}

async function persistArchivedUsageSnapshot(
  ctx: MutationCtx,
  args: {
    teamId: Id<"teams">;
    snapshot: CanonicalWatchUsageSnapshot;
  },
) {
  const usageRows = await ctx.db
    .query("teamWatchUsage")
    .withIndex("by_team_and_month", (q) =>
      q.eq("teamId", args.teamId).eq("monthKey", args.snapshot.monthKey),
    )
    .collect();

  const compactedUsage = planUsageCompaction(usageRows);
  const hasUsage =
    args.snapshot.memberWatchSeconds > 0 || args.snapshot.sharedWatchSeconds > 0;

  if (!hasUsage) {
    if (!compactedUsage) return;
    await ctx.db.delete(compactedUsage.primary._id);
    for (const duplicateId of compactedUsage.duplicateIds) {
      await ctx.db.delete(duplicateId);
    }
    return;
  }

  if (compactedUsage) {
    await ctx.db.patch(compactedUsage.primary._id, {
      memberWatchSeconds: args.snapshot.memberWatchSeconds,
      sharedWatchSeconds: args.snapshot.sharedWatchSeconds,
      updatedAt: args.snapshot.updatedAt,
    });
    for (const duplicateId of compactedUsage.duplicateIds) {
      await ctx.db.delete(duplicateId);
    }
    return;
  }

  await ctx.db.insert("teamWatchUsage", {
    teamId: args.teamId,
    monthKey: args.snapshot.monthKey,
    memberWatchSeconds: args.snapshot.memberWatchSeconds,
    sharedWatchSeconds: args.snapshot.sharedWatchSeconds,
    updatedAt: args.snapshot.updatedAt,
  });
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
    usageKind: v.union(v.literal("member"), v.literal("shared")),
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

    const usageKind: WatchUsageKind =
      resolvedViewerKind === "member" ? "member" : "shared";
    let capReached = false;
    let consumedWatchSeconds = 0;
    if (requestedWatchSeconds > 0) {
      const subscriptionState = await getTeamSubscriptionState(ctx, project.teamId);
      const monthKey = getCurrentBillingMonthKey(new Date());
      let legacyCurrentMonthUsage: Pick<
        CanonicalWatchUsageSnapshot,
        "memberWatchSeconds" | "sharedWatchSeconds"
      > | null = null;

      const teamMonthKey =
        typeof subscriptionState.team.currentWatchUsageMonthKey === "string" &&
        subscriptionState.team.currentWatchUsageMonthKey.length > 0
          ? subscriptionState.team.currentWatchUsageMonthKey
          : null;

      if (teamMonthKey !== monthKey) {
        const usageRows = await ctx.db
          .query("teamWatchUsage")
          .withIndex("by_team_and_month", (q) =>
            q.eq("teamId", project.teamId).eq("monthKey", monthKey),
          )
          .collect();

        const compactedUsage = planUsageCompaction(usageRows);
        if (compactedUsage) {
          legacyCurrentMonthUsage = {
            memberWatchSeconds: compactedUsage.memberWatchSeconds,
            sharedWatchSeconds: compactedUsage.sharedWatchSeconds,
          };

          // Current-month usage is migrated onto the team document, so remove
          // legacy rows after seeding to avoid stale, misleading counters.
          await ctx.db.delete(compactedUsage.primary._id);
          for (const duplicateId of compactedUsage.duplicateIds) {
            await ctx.db.delete(duplicateId);
          }
        }
      }

      const canonicalUsageState = resolveCanonicalWatchUsageState({
        team: subscriptionState.team,
        currentMonthKey: monthKey,
        legacyCurrentMonthUsage,
        now,
      });

      if (canonicalUsageState.previousUsageToArchive) {
        await persistArchivedUsageSnapshot(ctx, {
          teamId: project.teamId,
          snapshot: canonicalUsageState.previousUsageToArchive,
        });
      }

      const limitMinutes =
        usageKind === "member"
          ? TEAM_PLAN_MEMBER_WATCH_MINUTES_LIMIT[subscriptionState.plan]
          : TEAM_PLAN_SHARED_LINK_WATCH_MINUTES_LIMIT[subscriptionState.plan];

      const usageUpdate = planWatchUsageUpdate({
        usage: canonicalUsageState.currentUsage,
        usageKind,
        requestedWatchSeconds,
        limitSeconds: limitMinutes * 60,
        updatedAt: now,
      });

      consumedWatchSeconds = usageUpdate.consumedWatchSeconds;
      capReached = usageUpdate.capReached;

      const shouldPersistCanonicalUsage =
        canonicalUsageState.shouldBootstrapFromLegacyCurrentMonth ||
        subscriptionState.team.currentWatchUsageMonthKey !==
          usageUpdate.nextUsage.monthKey ||
        normalizeStoredWatchSeconds(
          subscriptionState.team.currentMemberWatchSeconds,
        ) !== usageUpdate.nextUsage.memberWatchSeconds ||
        normalizeStoredWatchSeconds(
          subscriptionState.team.currentSharedWatchSeconds,
        ) !== usageUpdate.nextUsage.sharedWatchSeconds;

      if (shouldPersistCanonicalUsage) {
        await ctx.db.patch(project.teamId, {
          currentWatchUsageMonthKey: usageUpdate.nextUsage.monthKey,
          currentMemberWatchSeconds: usageUpdate.nextUsage.memberWatchSeconds,
          currentSharedWatchSeconds: usageUpdate.nextUsage.sharedWatchSeconds,
          currentWatchUsageUpdatedAt: usageUpdate.nextUsage.updatedAt,
        });
      }
    }

    if (requestedWatchSeconds > 0 && consumedWatchSeconds <= 0) {
      return {
        recorded: false,
        capReached,
        usageKind,
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

    const result: RecordWatchEventResult = {
      recorded: true,
      capReached,
      usageKind,
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
