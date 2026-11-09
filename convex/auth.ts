import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type ClerkIdentity = NonNullable<
  Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>
>;

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getOptionalString(identity: ClerkIdentity, key: string): string | undefined {
  const value = (identity as Record<string, unknown>)[key];
  return hasString(value) ? value : undefined;
}

export function identityName(identity: ClerkIdentity): string {
  const name = getOptionalString(identity, "name");
  if (name) return name;

  const firstName = getOptionalString(identity, "firstName");
  const lastName = getOptionalString(identity, "lastName");
  if (firstName && lastName) return `${firstName} ${lastName}`;

  const email = getOptionalString(identity, "email");
  if (email) return email;

  return "Unknown";
}

export function identityEmail(identity: ClerkIdentity): string {
  return getOptionalString(identity, "email") ?? "";
}

export function identityAvatarUrl(identity: ClerkIdentity): string | undefined {
  return getOptionalString(identity, "pictureUrl");
}

export async function getUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return identity;
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in again to continue.",
    });
  }
  return user;
}

export async function getIdentity(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in again to continue.",
    });
  }
  return identity;
}

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

export function hasRequiredRole(role: Role, requiredRole?: Role) {
  if (!requiredRole) {
    return true;
  }

  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];
}

export function resolveVideoAccessMode(
  video: Pick<Doc<"videos">, "accessMode">,
): "team" | "restricted" {
  return video.accessMode ?? "team";
}

export async function getTeamMembership(
  ctx: QueryCtx | MutationCtx,
  args: {
    teamId: Id<"teams">;
    userClerkId: string;
  },
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", args.teamId).eq("userClerkId", args.userClerkId)
    )
    .unique();
}

export async function canTeamMemberAccessVideo(
  ctx: QueryCtx | MutationCtx,
  args: {
    grantedVideoIds?: ReadonlySet<Id<"videos">>;
    membership: Doc<"teamMembers">;
    video: Pick<Doc<"videos">, "_id" | "accessMode" | "uploadedByClerkId">;
  },
) {
  if (canTeamMemberAccessVideoWithGrantSet(args)) {
    return true;
  }

  if (args.grantedVideoIds) {
    return false;
  }

  const grant = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_video_and_user", (q) =>
      q.eq("videoId", args.video._id).eq("userClerkId", args.membership.userClerkId)
    )
    .unique();

  return grant !== null;
}

export function canTeamMemberAccessVideoWithGrantSet(args: {
  grantedVideoIds?: ReadonlySet<Id<"videos">>;
  membership: Pick<Doc<"teamMembers">, "userClerkId">;
  video: Pick<Doc<"videos">, "_id" | "accessMode" | "uploadedByClerkId">;
}) {
  const accessMode = resolveVideoAccessMode(args.video);
  if (accessMode === "team") {
    return true;
  }

  if (args.video.uploadedByClerkId === args.membership.userClerkId) {
    return true;
  }

  return args.grantedVideoIds?.has(args.video._id) ?? false;
}

export function canManageVideoSharing(args: {
  membership: Pick<Doc<"teamMembers">, "role" | "userClerkId">;
  video: Pick<Doc<"videos">, "uploadedByClerkId">;
}) {
  if (args.video.uploadedByClerkId === args.membership.userClerkId) {
    return true;
  }

  return args.membership.role === "admin" || args.membership.role === "owner";
}

function requireTeamMembershipOrThrow(
  membership: Doc<"teamMembers"> | null
): Doc<"teamMembers"> {
  if (!membership) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not have access to this team.",
    });
  }

  return membership;
}

function requireRoleOrThrow(
  membership: Doc<"teamMembers">,
  requiredRole?: Role
) {
  if (!hasRequiredRole(membership.role, requiredRole)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Requires ${requiredRole} role or higher.`,
    });
  }
}

export async function requireTeamAccess(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  requiredRole?: Role
) {
  const user = await requireUser(ctx);

  const membership = requireTeamMembershipOrThrow(
    await getTeamMembership(ctx, {
      teamId,
      userClerkId: user.subject,
    })
  );
  requireRoleOrThrow(membership, requiredRole);

  return { user, membership };
}

export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  requiredRole?: Role
) {
  const user = await requireUser(ctx);

  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  }

  // Flattened lookup (upstream 62c0463): one identity read plus one direct
  // teamMembers lookup, instead of delegating to requireTeamAccess.
  const membership = requireTeamMembershipOrThrow(
    await getTeamMembership(ctx, {
      teamId: project.teamId,
      userClerkId: user.subject,
    })
  );
  requireRoleOrThrow(membership, requiredRole);

  return { user, membership, project };
}

export async function requireVideoAccess(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
  requiredRole?: Role
) {
  const user = await requireUser(ctx);

  const video = await ctx.db.get(videoId);
  if (!video) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Video not found.",
    });
  }

  const project = await ctx.db.get(video.projectId);
  if (!project) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  }

  // Flattened lookup (upstream 62c0463): no requireTeamAccess delegation,
  // so video-scoped calls pay one identity read and one membership lookup.
  const membership = requireTeamMembershipOrThrow(
    await getTeamMembership(ctx, {
      teamId: project.teamId,
      userClerkId: user.subject,
    })
  );

  const canAccess = await canTeamMemberAccessVideo(ctx, {
    membership,
    video,
  });
  if (!canAccess) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not have access to this video.",
    });
  }

  requireRoleOrThrow(membership, requiredRole);

  return { user, membership, project, video };
}

export async function requireVideoManagementAccess(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
) {
  const user = await requireUser(ctx);

  const video = await ctx.db.get(videoId);
  if (!video) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Video not found.",
    });
  }

  const project = await ctx.db.get(video.projectId);
  if (!project) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  }

  // Flattened lookup (upstream 62c0463), same guard order as before:
  // membership first, then the video-management permission check.
  const membership = requireTeamMembershipOrThrow(
    await getTeamMembership(ctx, {
      teamId: project.teamId,
      userClerkId: user.subject,
    })
  );

  if (
    membership.role === "viewer" ||
    !canManageVideoSharing({
      membership,
      video,
    })
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage sharing for this video.",
    });
  }

  return { user, membership, project, video };
}
