import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { v, ConvexError } from "convex/values";
import { components } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import {
  canManageVideoSharing,
  getTeamMembership,
  identityName,
  requireUser,
} from "./auth";
import { generateUniqueToken, hashPassword, verifyPassword } from "./security";
import { resolveStackVersions } from "./videos";
import { findShareLinkByToken, issueShareAccessGrant } from "./shareAccess";
import {
  hasPasswordProtection,
  isShareLinkPasswordLocked,
  normalizeProvidedPassword,
  planSharePasswordFailure,
  planSharePasswordSuccess,
  resolveShareLinkStatus,
} from "./shareLinkAuth";
import { pickReusableDefaultShareLink } from "./shareLinkDefaults";

const shareLinkStatusValidator = v.union(
  v.literal("missing"),
  v.literal("expired"),
  v.literal("processing"),
  v.literal("failed"),
  v.literal("requiresPassword"),
  v.literal("ok"),
);

const shareAccessGrantFailureReasonValidator = v.union(
  v.literal("missing"),
  v.literal("expired"),
  v.literal("processing"),
  v.literal("failed"),
  v.literal("passwordRejected"),
  v.literal("rateLimited"),
  v.literal("unavailable"),
);

const shareLinkRateLimiter = new RateLimiter(components.rateLimiter, {
  grantGlobal: {
    kind: "fixed window",
    rate: 600,
    period: MINUTE,
    shards: 8,
  },
  grantByToken: {
    kind: "fixed window",
    rate: 120,
    period: MINUTE,
  },
  passwordFailuresByToken: {
    kind: "fixed window",
    rate: 10,
    period: MINUTE,
  },
});

async function generateShareToken(ctx: MutationCtx) {
  return await generateUniqueToken(
    32,
    async (candidate) =>
      (await ctx.db
        .query("shareLinks")
        .withIndex("by_token", (q) => q.eq("token", candidate))
        .unique()) !== null,
    5,
  );
}

async function deleteShareAccessGrantsForLink(
  ctx: MutationCtx,
  shareLinkId: Id<"shareLinks">,
) {
  const grants = await ctx.db
    .query("shareAccessGrants")
    .withIndex("by_share_link", (q) => q.eq("shareLinkId", shareLinkId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

/**
 * Every version of the requested video's stack, oldest to newest. Throws
 * NOT_FOUND when the stack vanished mid-request.
 */
async function requireStackVersions(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
) {
  const versions = await resolveStackVersions(ctx, videoId);
  if (!versions) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Video not found." });
  }
  return versions;
}

/**
 * Share-link management is stack-wide, mirroring the reciprocal grant model:
 * the uploader of any version of the stack, or a team admin or owner, may
 * manage the stack's links. create, list, ensureDefault, remove, and update
 * all guard through this one helper, so a link is manageable no matter which
 * version it sits on — including the previous ready head that keeps serving
 * a stack while a new head uploads.
 */
async function requireStackManagementAccess(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
) {
  const user = await requireUser(ctx);
  const versions = await requireStackVersions(ctx, videoId);

  const project = await ctx.db.get(versions[0].projectId);
  if (!project) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Project not found." });
  }

  const membership = await getTeamMembership(ctx, {
    teamId: project.teamId,
    userClerkId: user.subject,
  });
  if (!membership) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not have access to this team.",
    });
  }

  if (
    membership.role === "viewer" ||
    !versions.some((video) => canManageVideoSharing({ membership, video }))
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage sharing for this video.",
    });
  }

  return { user, versions };
}

/**
 * Collect the share links of a whole stack. Links live on the head, but while
 * a new head uploads they keep serving the previous ready version, so a
 * stack-wide read is the only complete one.
 */
async function collectStackShareLinks(
  ctx: QueryCtx | MutationCtx,
  versions: Doc<"videos">[],
) {
  const links: Doc<"shareLinks">[] = [];
  for (const version of versions) {
    links.push(
      ...(await ctx.db
        .query("shareLinks")
        .withIndex("by_video", (q) => q.eq("videoId", version._id))
        .collect()),
    );
  }
  return links;
}

async function insertShareLink(
  ctx: MutationCtx,
  args: {
    allowDownload: boolean;
    createdByClerkId: string;
    createdByName: string;
    expiresAt?: number;
    passwordHash?: string;
    videoId: Id<"videos">;
  },
) {
  const token = await generateShareToken(ctx);

  await ctx.db.insert("shareLinks", {
    videoId: args.videoId,
    token,
    createdByClerkId: args.createdByClerkId,
    createdByName: args.createdByName,
    expiresAt: args.expiresAt,
    allowDownload: args.allowDownload,
    password: undefined,
    passwordHash: args.passwordHash,
    failedAccessAttempts: 0,
    lockedUntil: undefined,
    viewCount: 0,
  });

  return { token };
}

export const create = mutation({
  args: {
    videoId: v.id("videos"),
    expiresInDays: v.optional(v.number()),
    allowDownload: v.optional(v.boolean()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Guard stack-wide (any version's manager may manage the stack's links),
    // then attach the link to the current stack head so it survives later
    // version cuts.
    const { user, versions } = await requireStackManagementAccess(
      ctx,
      args.videoId,
    );
    const head = versions[versions.length - 1];

    const expiresAt = args.expiresInDays
      ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;
    const normalizedPassword = normalizeProvidedPassword(args.password);
    const passwordHash = normalizedPassword
      ? await hashPassword(normalizedPassword)
      : undefined;

    return await insertShareLink(ctx, {
      videoId: head._id,
      createdByClerkId: user.subject,
      createdByName: identityName(user),
      expiresAt,
      allowDownload: args.allowDownload ?? false,
      passwordHash,
    });
  },
});

export const ensureDefault = mutation({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.object({
    reused: v.boolean(),
    token: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user, versions } = await requireStackManagementAccess(
      ctx,
      args.videoId,
    );
    const head = versions[versions.length - 1];

    // Reuse is checked across the stack: the default link may still sit on
    // the previous ready head while a new head uploads.
    const links = await collectStackShareLinks(ctx, versions);

    const reusableLink = pickReusableDefaultShareLink(links);
    if (reusableLink) {
      return {
        token: reusableLink.token,
        reused: true,
      };
    }

    const created = await insertShareLink(ctx, {
      videoId: head._id,
      createdByClerkId: user.subject,
      createdByName: identityName(user),
      allowDownload: false,
    });

    return {
      ...created,
      reused: false,
    };
  },
});

export const list = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const { versions } = await requireStackManagementAccess(ctx, args.videoId);
    // Links live on the stack's versions (the head, or the previous ready
    // head while a new version uploads); listing from any version shows the
    // same set.
    const links = await collectStackShareLinks(ctx, versions);

    const linksWithCreator = links.map((link) => ({
      _id: link._id,
      _creationTime: link._creationTime,
      videoId: link.videoId,
      token: link.token,
      createdByClerkId: link.createdByClerkId,
      createdByName: link.createdByName,
      expiresAt: link.expiresAt,
      allowDownload: link.allowDownload,
      viewCount: link.viewCount,
      hasPassword: hasPasswordProtection(link),
      creatorName: link.createdByName,
      isExpired: link.expiresAt ? link.expiresAt < Date.now() : false,
    }));

    return linksWithCreator;
  },
});

export const remove = mutation({
  args: { linkId: v.id("shareLinks") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError({ code: "NOT_FOUND", message: "Share link not found" });

    // Stack-wide guard: the link may sit on any version of its stack, and
    // any version's manager may manage the stack's links.
    await requireStackManagementAccess(ctx, link.videoId);

    await deleteShareAccessGrantsForLink(ctx, args.linkId);
    await ctx.db.delete(args.linkId);
  },
});

export const update = mutation({
  args: {
    linkId: v.id("shareLinks"),
    expiresInDays: v.optional(v.union(v.number(), v.null())),
    allowDownload: v.optional(v.boolean()),
    password: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new ConvexError({ code: "NOT_FOUND", message: "Share link not found" });

    // Stack-wide guard: the link may sit on any version of its stack, and
    // any version's manager may manage the stack's links.
    await requireStackManagementAccess(ctx, link.videoId);

    const updates: Partial<Doc<"shareLinks">> = {};

    if (args.expiresInDays !== undefined) {
      updates.expiresAt = args.expiresInDays
        ? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
        : undefined;
    }

    if (args.allowDownload !== undefined) {
      updates.allowDownload = args.allowDownload;
    }

    if (args.password !== undefined) {
      const normalizedPassword = normalizeProvidedPassword(args.password ?? undefined);
      if (normalizedPassword) {
        updates.passwordHash = await hashPassword(normalizedPassword);
        updates.password = undefined;
      } else {
        updates.passwordHash = undefined;
        updates.password = undefined;
      }
      updates.failedAccessAttempts = 0;
      updates.lockedUntil = undefined;
    }

    await ctx.db.patch(args.linkId, updates);
  },
});

export const getByToken = query({
  args: { token: v.string() },
  returns: v.object({
    status: shareLinkStatusValidator,
  }),
  handler: async (ctx, args) => {
    const link = await findShareLinkByToken(ctx, args.token);
    const video = link ? await ctx.db.get(link.videoId) : null;
    return {
      status: resolveShareLinkStatus({
        link,
        video,
      }),
    };
  },
});

export const issueAccessGrant = mutation({
  args: {
    token: v.string(),
    password: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    grantToken: v.union(v.string(), v.null()),
    failureReason: v.union(shareAccessGrantFailureReasonValidator, v.null()),
    retryAfterSeconds: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const globalAccessLimit = await shareLinkRateLimiter.limit(ctx, "grantGlobal");
    if (!globalAccessLimit.ok) {
      return {
        ok: false,
        grantToken: null,
        failureReason: "rateLimited" as const,
        retryAfterSeconds: globalAccessLimit.retryAfter ?? null,
      };
    }

    const accessLimit = await shareLinkRateLimiter.limit(ctx, "grantByToken", {
      key: args.token,
    });
    if (!accessLimit.ok) {
      return {
        ok: false,
        grantToken: null,
        failureReason: "rateLimited" as const,
        retryAfterSeconds: accessLimit.retryAfter ?? null,
      };
    }

    const link = await findShareLinkByToken(ctx, args.token);

    if (!link) {
      return {
        ok: false,
        grantToken: null,
        failureReason: "missing" as const,
        retryAfterSeconds: null,
      };
    }

    const now = Date.now();

    if (link.expiresAt && link.expiresAt <= now) {
      return {
        ok: false,
        grantToken: null,
        failureReason: "expired" as const,
        retryAfterSeconds: null,
      };
    }

    const video = await ctx.db.get(link.videoId);
    if (!video) {
      return {
        ok: false,
        grantToken: null,
        failureReason: "missing" as const,
        retryAfterSeconds: null,
      };
    }

    if (video.status === "failed") {
      return {
        ok: false,
        grantToken: null,
        failureReason: "failed" as const,
        retryAfterSeconds: null,
      };
    }

    if (video.status !== "ready") {
      return {
        ok: false,
        grantToken: null,
        failureReason: "processing" as const,
        retryAfterSeconds: null,
      };
    }

    if (hasPasswordProtection(link)) {
      if (isShareLinkPasswordLocked(link, now)) {
        return {
          ok: false,
          grantToken: null,
          failureReason: "rateLimited" as const,
          retryAfterSeconds:
            typeof link.lockedUntil === "number" && link.lockedUntil > now
              ? Math.max(1, Math.ceil((link.lockedUntil - now) / 1000))
              : null,
        };
      }

      const password = args.password ?? "";
      let passwordMatches = false;
      if (link.passwordHash) {
        passwordMatches = await verifyPassword(password, link.passwordHash);
      } else if (link.password) {
        passwordMatches = password === link.password;
      }

      if (!passwordMatches) {
        await shareLinkRateLimiter.limit(ctx, "passwordFailuresByToken", {
          key: args.token,
        });

        const updates: Partial<Doc<"shareLinks">> = planSharePasswordFailure(link, now);
        await ctx.db.patch(link._id, updates);
        return {
          ok: false,
          grantToken: null,
          failureReason: "passwordRejected" as const,
          retryAfterSeconds: null,
        };
      }

      const passwordSuccess = planSharePasswordSuccess(link);
      const successUpdates: Partial<Doc<"shareLinks">> = {
        ...passwordSuccess.updates,
      };
      if (passwordSuccess.shouldUpgradeLegacyPassword && link.password) {
        successUpdates.passwordHash = await hashPassword(link.password);
        successUpdates.password = undefined;
      }

      if (Object.keys(successUpdates).length > 0) {
        await ctx.db.patch(link._id, successUpdates);
      }
    }

    const grantToken = await issueShareAccessGrant(ctx, link._id);

    await ctx.db.patch(link._id, {
      viewCount: link.viewCount + 1,
    });

    return {
      ok: true,
      grantToken,
      failureReason: null,
      retryAfterSeconds: null,
    };
  },
});
