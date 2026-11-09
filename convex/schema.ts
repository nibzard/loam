import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerClerkId: v.string(),
    plan: v.union(
      v.literal("basic"),
      v.literal("pro"),
      v.literal("free"),
      v.literal("team")
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    billingStatus: v.optional(v.string()),
    currentWatchUsageMonthKey: v.optional(v.string()),
    currentMemberWatchSeconds: v.optional(v.number()),
    currentSharedWatchSeconds: v.optional(v.number()),
    currentWatchUsageUpdatedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerClerkId"])
    .index("by_stripe_customer_id", ["stripeCustomerId"])
    .index("by_stripe_subscription_id", ["stripeSubscriptionId"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userClerkId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userClerkId"])
    .index("by_team_and_user", ["teamId", "userClerkId"])
    .index("by_team_and_email", ["teamId", "userEmail"]),

  teamInvites: defineTable({
    teamId: v.id("teams"),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
    invitedByClerkId: v.string(),
    invitedByName: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  projects: defineTable({
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  }).index("by_team", ["teamId"]),

  videos: defineTable({
    projectId: v.id("projects"),
    uploadedByClerkId: v.string(),
    uploaderName: v.string(),
    uploaderEmail: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    accessMode: v.optional(v.union(v.literal("team"), v.literal("restricted"))),
    visibility: v.union(v.literal("public"), v.literal("private")),
    publicId: v.string(),
    // Mux video references
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    muxAssetStatus: v.optional(
      v.union(
        v.literal("preparing"),
        v.literal("ready"),
        v.literal("errored")
      )
    ),
    uploadGeneration: v.optional(v.number()),
    uploadSessionToken: v.optional(v.string()),
    // Metadata
    s3Key: v.optional(v.string()),
    duration: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    contentType: v.optional(v.string()),
    uploadError: v.optional(v.string()),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    workflowStatus: v.union(
      v.literal("review"),
      v.literal("rework"),
      v.literal("done"),
    ),
    // Version stacks (upstream 9e85de3/0dfb0d1). Existing rows are implicit
    // v1 videos; these fields materialize when the first additional version
    // is created, so no backfill is required. versionStackId is an opaque
    // stable identity and can keep referencing a deleted original v1 row.
    versionStackId: v.optional(v.id("videos")),
    versionNumber: v.optional(v.number()),
    supersededByVideoId: v.optional(v.id("videos")),
  })
    .index("by_project", ["projectId"])
    // Listings show stack heads only: supersededByVideoId is undefined
    // exactly on the current head of each stack (and on standalone videos).
    // shareLinks.videoId tracks the current READY head — it moves to a new
    // version only when that version turns ready, so share viewers keep the
    // previous version during an upload (see planShareLinkRepointOnReady).
    .index("by_project_and_superseded_by_video_id", [
      "projectId",
      "supersededByVideoId",
    ])
    // Alphabetical sort of the heads of a project (upstream 0c2a980).
    .index("by_project_id_and_superseded_by_video_id_and_title", [
      "projectId",
      "supersededByVideoId",
      "title",
    ])
    .index("by_version_stack_id_and_version_number", [
      "versionStackId",
      "versionNumber",
    ])
    .index("by_superseded_by_video_id", ["supersededByVideoId"])
    .index("by_public_id", ["publicId"])
    .index("by_mux_upload_id", ["muxUploadId"])
    .index("by_mux_asset_id", ["muxAssetId"])
    .index("by_mux_playback_id", ["muxPlaybackId"]),

  comments: defineTable({
    videoId: v.id("videos"),
    userClerkId: v.string(),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    audience: v.optional(v.union(v.literal("team"), v.literal("share"))),
    text: v.string(),
    timestampSeconds: v.number(),
    parentId: v.optional(v.id("comments")),
    resolved: v.boolean(),
  })
    .index("by_video", ["videoId"])
    .index("by_video_and_timestamp", ["videoId", "timestampSeconds"])
    .index("by_parent", ["parentId"]),

  reactions: defineTable({
    videoId: v.id("videos"),
    userClerkId: v.string(),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    audience: v.optional(v.union(v.literal("team"), v.literal("share"))),
    emoji: v.string(),
    timestampSeconds: v.number(),
  })
    .index("by_video", ["videoId"])
    .index("by_video_and_timestamp", ["videoId", "timestampSeconds"]),

  videoWatchEvents: defineTable({
    videoId: v.id("videos"),
    fingerprint: v.string(),
    viewerKind: v.union(v.literal("member"), v.literal("guest")),
    viewerLabel: v.string(),
    source: v.union(
      v.literal("dashboard"),
      v.literal("public"),
      v.literal("share"),
    ),
    firstWatchedAt: v.number(),
    lastWatchedAt: v.number(),
    watchCount: v.number(),
    watchSeconds: v.number(),
  })
    .index("by_video", ["videoId"])
    .index("by_video_and_fingerprint", ["videoId", "fingerprint"]),

  teamWatchUsage: defineTable({
    teamId: v.id("teams"),
    monthKey: v.string(),
    memberWatchSeconds: v.number(),
    sharedWatchSeconds: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_and_month", ["teamId", "monthKey"]),

  shareLinks: defineTable({
    videoId: v.id("videos"),
    token: v.string(),
    createdByClerkId: v.string(),
    createdByName: v.string(),
    expiresAt: v.optional(v.number()),
    allowDownload: v.boolean(),
    password: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    failedAccessAttempts: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    viewCount: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_video", ["videoId"]),

  shareAccessGrants: defineTable({
    shareLinkId: v.id("shareLinks"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_share_link", ["shareLinkId"]),

  videoMemberGrants: defineTable({
    videoId: v.id("videos"),
    teamId: v.id("teams"),
    userClerkId: v.string(),
    grantedByClerkId: v.string(),
  })
    .index("by_team", ["teamId"])
    .index("by_video", ["videoId"])
    .index("by_video_and_user", ["videoId", "userClerkId"])
    .index("by_team_and_user", ["teamId", "userClerkId"]),
});
