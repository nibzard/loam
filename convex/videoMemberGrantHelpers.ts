import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

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

