import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

/** A grant row's ACL-relevant fields, without the per-video key. */
export type VideoMemberGrantRow = {
  teamId: Id<"teams">;
  userClerkId: string;
  grantedByClerkId: string;
};

export async function getGrantedVideoIdsForTeamUser(
  ctx: ReadCtx,
  args: {
    teamId: Id<"teams">;
    userClerkId: string;
  },
) {
  const grants = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", args.teamId).eq("userClerkId", args.userClerkId),
    )
    .collect();

  return new Set(grants.map((grant) => grant.videoId));
}

export async function getVideoMemberGrantsForVideo(
  ctx: ReadCtx,
  videoId: Id<"videos">,
): Promise<Array<Doc<"videoMemberGrants">>> {
  return await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();
}

/**
 * Insert prepared grant rows for one video. Callers derive the rows with the
 * pure planner in videos.ts (`planInheritedVersionGrants` — it plans the new
 * version's copied grants plus reciprocal creator grants on older versions)
 * so the set transformation stays unit-testable without a database.
 */
export async function insertVideoMemberGrantRows(
  ctx: MutationCtx,
  args: {
    videoId: Id<"videos">;
    rows: ReadonlyArray<VideoMemberGrantRow>;
  },
) {
  for (const row of args.rows) {
    await ctx.db.insert("videoMemberGrants", {
      videoId: args.videoId,
      teamId: row.teamId,
      userClerkId: row.userClerkId,
      grantedByClerkId: row.grantedByClerkId,
    });
  }
}

export async function deleteVideoMemberGrantsForVideo(
  ctx: MutationCtx,
  videoId: Id<"videos">,
) {
  const grants = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_video", (q) => q.eq("videoId", videoId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

export async function deleteVideoMemberGrantsForTeamUser(
  ctx: MutationCtx,
  args: {
    teamId: Id<"teams">;
    userClerkId: string;
  },
) {
  const grants = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", args.teamId).eq("userClerkId", args.userClerkId),
    )
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

export async function deleteVideoMemberGrantsForTeam(
  ctx: MutationCtx,
  teamId: Id<"teams">,
) {
  const grants = await ctx.db
    .query("videoMemberGrants")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();

  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}

