import assert from "node:assert/strict";
import test from "node:test";

import { ConvexError } from "convex/values";

import {
  canManageVideoSharing,
  canTeamMemberAccessVideoWithGrantSet,
  requireProjectAccess,
  requireTeamAccess,
  requireVideoAccess,
  requireVideoManagementAccess,
} from "./auth";

test("uploader can manage sharing for their own video", () => {
  assert.equal(
    canManageVideoSharing({
      membership: {
        role: "member",
        userClerkId: "user_1",
      } as never,
      video: {
        uploadedByClerkId: "user_1",
      } as never,
    }),
    true,
  );
});

test("regular members cannot manage sharing for a teammate video", () => {
  assert.equal(
    canManageVideoSharing({
      membership: {
        role: "member",
        userClerkId: "user_2",
      } as never,
      video: {
        uploadedByClerkId: "user_1",
      } as never,
    }),
    false,
  );
});

test("admins can manage sharing for a teammate video", () => {
  assert.equal(
    canManageVideoSharing({
      membership: {
        role: "admin",
        userClerkId: "user_2",
      } as never,
      video: {
        uploadedByClerkId: "user_1",
      } as never,
    }),
    true,
  );
});

test("restricted video access can be resolved from a preloaded grant set", () => {
  assert.equal(
    canTeamMemberAccessVideoWithGrantSet({
      grantedVideoIds: new Set(["video_1" as never]),
      membership: {
        userClerkId: "user_2",
      } as never,
      video: {
        _id: "video_1",
        accessMode: "restricted",
        uploadedByClerkId: "user_1",
      } as never,
    }),
    true,
  );
});

test("restricted video access is denied without uploader ownership or a preloaded grant", () => {
  assert.equal(
    canTeamMemberAccessVideoWithGrantSet({
      grantedVideoIds: new Set(),
      membership: {
        userClerkId: "user_2",
      } as never,
      video: {
        _id: "video_1",
        accessMode: "restricted",
        uploadedByClerkId: "user_1",
      } as never,
    }),
    false,
  );
});

const TEAM_ID = "team_1";
const PROJECT_ID = "project_1";
const VIDEO_TEAM_ID = "video_team";
const VIDEO_RESTRICTED_ID = "video_restricted";

function membershipFor(userClerkId: string, role: string) {
  return {
    _id: `member_${userClerkId}`,
    teamId: TEAM_ID,
    userClerkId,
    role,
  };
}

function baseRecords() {
  return {
    projects: {
      [PROJECT_ID]: { _id: PROJECT_ID, teamId: TEAM_ID, name: "Project" },
    },
    videos: {
      [VIDEO_TEAM_ID]: {
        _id: VIDEO_TEAM_ID,
        projectId: PROJECT_ID,
        accessMode: "team",
        uploadedByClerkId: "user_uploader",
      },
      [VIDEO_RESTRICTED_ID]: {
        _id: VIDEO_RESTRICTED_ID,
        projectId: PROJECT_ID,
        accessMode: "restricted",
        uploadedByClerkId: "user_uploader",
      },
    },
  };
}

function createAuthCtx({
  identity = { subject: "user_member" },
  memberships = [],
  grants = [],
  projects = {},
  videos = {},
}: {
  identity?: { subject: string } | null;
  memberships?: Array<ReturnType<typeof membershipFor>>;
  grants?: Array<{ teamId: string; videoId: string; userClerkId: string }>;
  projects?: Record<string, Record<string, unknown>>;
  videos?: Record<string, Record<string, unknown>>;
} = {}) {
  let identityReads = 0;
  let membershipLookups = 0;

  const membershipByTeamAndUser = new Map(
    memberships.map((membership) => [
      `${membership.teamId}::${membership.userClerkId}`,
      membership,
    ]),
  );
  const grantByVideoAndUser = new Map(
    grants.map((grant) => [`${grant.videoId}::${grant.userClerkId}`, grant]),
  );

  const ctx = {
    auth: {
      getUserIdentity: async () => {
        identityReads += 1;
        return identity;
      },
    },
    db: {
      get: async (id: string) => projects[id] ?? videos[id] ?? null,
      query: (tableName: string) => ({
        withIndex: (
          _indexName: string,
          apply: (q: {
            eq: (_field: string, value: string) => unknown;
          }) => unknown,
        ) => {
          const values: string[] = [];
          const q = {
            eq: (_field: string, value: string) => {
              values.push(value);
              return q;
            },
          };
          apply(q);
          const key = values.join("::");

          if (tableName === "teamMembers") {
            membershipLookups += 1;
            return {
              unique: async () => membershipByTeamAndUser.get(key) ?? null,
            };
          }

          if (tableName === "videoMemberGrants") {
            return {
              unique: async () => grantByVideoAndUser.get(key) ?? null,
            };
          }

          throw new Error(`Unexpected table ${tableName}`);
        },
      }),
    },
  };

  return {
    ctx,
    identityReads: () => identityReads,
    membershipLookups: () => membershipLookups,
  };
}

async function assertDenialCode(
  promise: Promise<unknown>,
  expected: { code: string; message: string },
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ConvexError, "expected a ConvexError");
    assert.deepEqual(error.data, expected);
    return true;
  });
}

test("requireTeamAccess admits every role and enforces the hierarchy", async () => {
  for (const role of ["viewer", "member", "admin", "owner"]) {
    const { ctx } = createAuthCtx({
      memberships: [membershipFor("user_member", role)],
    });
    const granted = await requireTeamAccess(ctx as never, TEAM_ID as never);
    assert.equal(granted.membership.role, role);
    assert.equal(granted.user.subject, "user_member");
  }

  for (const [role, requiredRole] of [
    ["viewer", "member"],
    ["member", "admin"],
    ["admin", "owner"],
  ] as const) {
    const { ctx } = createAuthCtx({
      memberships: [membershipFor("user_member", role)],
    });
    await assertDenialCode(
      requireTeamAccess(ctx as never, TEAM_ID as never, requiredRole as never),
      {
        code: "FORBIDDEN",
        message: `Requires ${requiredRole} role or higher.`,
      },
    );
  }
});

test("requireTeamAccess rejects non-members and unauthenticated callers", async () => {
  const outsider = createAuthCtx({ memberships: [] });
  await assertDenialCode(
    requireTeamAccess(outsider.ctx as never, TEAM_ID as never),
    { code: "FORBIDDEN", message: "You do not have access to this team." },
  );

  const anonymous = createAuthCtx({
    identity: null,
    memberships: [membershipFor("user_member", "member")],
  });
  await assertDenialCode(
    requireTeamAccess(anonymous.ctx as never, TEAM_ID as never),
    { code: "UNAUTHENTICATED", message: "Sign in again to continue." },
  );
});

test("requireProjectAccess resolves access with one identity read and one membership lookup", async () => {
  const harness = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
  });

  const { user, membership, project } = await requireProjectAccess(
    harness.ctx as never,
    PROJECT_ID as never,
  );
  assert.equal(user.subject, "user_member");
  assert.equal(membership.role, "member");
  assert.equal(project._id, PROJECT_ID);
  assert.equal(harness.identityReads(), 1);
  assert.equal(harness.membershipLookups(), 1);
});

test("requireProjectAccess denial codes are unchanged", async () => {
  const missingProject = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
  });
  await assertDenialCode(
    requireProjectAccess(missingProject.ctx as never, "project_missing" as never),
    { code: "NOT_FOUND", message: "Project not found." },
  );

  const nonMember = createAuthCtx(baseRecords());
  await assertDenialCode(
    requireProjectAccess(nonMember.ctx as never, PROJECT_ID as never),
    { code: "FORBIDDEN", message: "You do not have access to this team." },
  );

  const viewer = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "viewer")],
  });
  await assertDenialCode(
    requireProjectAccess(viewer.ctx as never, PROJECT_ID as never, "member" as never),
    { code: "FORBIDDEN", message: "Requires member role or higher." },
  );
});

test("requireVideoAccess admits team members on team videos with one identity read", async () => {
  const harness = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
  });

  const { user, membership, project, video } = await requireVideoAccess(
    harness.ctx as never,
    VIDEO_TEAM_ID as never,
  );
  assert.equal(user.subject, "user_member");
  assert.equal(membership.role, "member");
  assert.equal(project._id, PROJECT_ID);
  assert.equal(video._id, VIDEO_TEAM_ID);
  assert.equal(harness.identityReads(), 1);
  assert.equal(harness.membershipLookups(), 1);
});

test("requireVideoAccess keeps grant-based decisions on restricted videos", async () => {
  const denied = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
  });
  await assertDenialCode(
    requireVideoAccess(denied.ctx as never, VIDEO_RESTRICTED_ID as never),
    { code: "FORBIDDEN", message: "You do not have access to this video." },
  );

  const granted = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
    grants: [
      {
        teamId: TEAM_ID,
        videoId: VIDEO_RESTRICTED_ID,
        userClerkId: "user_member",
      },
    ],
  });
  const viaGrant = await requireVideoAccess(
    granted.ctx as never,
    VIDEO_RESTRICTED_ID as never,
  );
  assert.equal(viaGrant.video._id, VIDEO_RESTRICTED_ID);

  const uploader = createAuthCtx({
    ...baseRecords(),
    identity: { subject: "user_uploader" },
    memberships: [membershipFor("user_uploader", "member")],
  });
  const viaOwnership = await requireVideoAccess(
    uploader.ctx as never,
    VIDEO_RESTRICTED_ID as never,
  );
  assert.equal(viaOwnership.membership.userClerkId, "user_uploader");
});

test("requireVideoAccess denial codes are unchanged", async () => {
  await assertDenialCode(
    requireVideoAccess(
      createAuthCtx({
        ...baseRecords(),
        memberships: [membershipFor("user_member", "member")],
      }).ctx as never,
      "video_missing" as never,
    ),
    { code: "NOT_FOUND", message: "Video not found." },
  );

  const orphan = createAuthCtx({
    memberships: [membershipFor("user_member", "member")],
    videos: { [VIDEO_TEAM_ID]: { ...baseRecords().videos[VIDEO_TEAM_ID] } },
  });
  await assertDenialCode(
    requireVideoAccess(orphan.ctx as never, VIDEO_TEAM_ID as never),
    { code: "NOT_FOUND", message: "Project not found." },
  );

  await assertDenialCode(
    requireVideoAccess(
      createAuthCtx(baseRecords()).ctx as never,
      VIDEO_TEAM_ID as never,
    ),
    { code: "FORBIDDEN", message: "You do not have access to this team." },
  );

  const viewer = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "viewer")],
  });
  await assertDenialCode(
    requireVideoAccess(
      viewer.ctx as never,
      VIDEO_TEAM_ID as never,
      "member" as never,
    ),
    { code: "FORBIDDEN", message: "Requires member role or higher." },
  );
});

test("requireVideoAccess role decisions match the pre-flattening chain", async () => {
  const cases = [
    { role: "viewer", requiredRole: undefined, admitted: true },
    { role: "member", requiredRole: undefined, admitted: true },
    { role: "admin", requiredRole: "admin", admitted: true },
    { role: "owner", requiredRole: "admin", admitted: true },
    { role: "member", requiredRole: "admin", admitted: false },
    { role: "viewer", requiredRole: "member", admitted: false },
  ] as const;

  for (const scenario of cases) {
    const { ctx } = createAuthCtx({
      ...baseRecords(),
      memberships: [membershipFor("user_member", scenario.role)],
    });

    if (scenario.admitted) {
      const { membership } = await requireVideoAccess(
        ctx as never,
        VIDEO_TEAM_ID as never,
        scenario.requiredRole as never,
      );
      assert.equal(membership.role, scenario.role);
    } else {
      await assertDenialCode(
        requireVideoAccess(
          ctx as never,
          VIDEO_TEAM_ID as never,
          scenario.requiredRole as never,
        ),
        {
          code: "FORBIDDEN",
          message: `Requires ${scenario.requiredRole} role or higher.`,
        },
      );
    }
  }
});

test("requireVideoManagementAccess keeps uploader and admin management decisions", async () => {
  const uploader = createAuthCtx({
    ...baseRecords(),
    identity: { subject: "user_uploader" },
    memberships: [membershipFor("user_uploader", "member")],
  });
  const own = await requireVideoManagementAccess(
    uploader.ctx as never,
    VIDEO_TEAM_ID as never,
  );
  assert.equal(own.membership.userClerkId, "user_uploader");
  assert.equal(uploader.identityReads(), 1);
  assert.equal(uploader.membershipLookups(), 1);

  for (const role of ["admin", "owner"]) {
    const manager = createAuthCtx({
      ...baseRecords(),
      memberships: [membershipFor("user_member", role)],
    });
    const { membership } = await requireVideoManagementAccess(
      manager.ctx as never,
      VIDEO_TEAM_ID as never,
    );
    assert.equal(membership.role, role);
  }
});

test("requireVideoManagementAccess denial codes are unchanged", async () => {
  const member = createAuthCtx({
    ...baseRecords(),
    memberships: [membershipFor("user_member", "member")],
  });
  await assertDenialCode(
    requireVideoManagementAccess(member.ctx as never, VIDEO_TEAM_ID as never),
    {
      code: "FORBIDDEN",
      message: "You do not have permission to manage sharing for this video.",
    },
  );

  const viewerUploader = createAuthCtx({
    ...baseRecords(),
    identity: { subject: "user_uploader" },
    memberships: [membershipFor("user_uploader", "viewer")],
  });
  await assertDenialCode(
    requireVideoManagementAccess(
      viewerUploader.ctx as never,
      VIDEO_TEAM_ID as never,
    ),
    {
      code: "FORBIDDEN",
      message: "You do not have permission to manage sharing for this video.",
    },
  );

  const nonMember = createAuthCtx(baseRecords());
  await assertDenialCode(
    requireVideoManagementAccess(
      nonMember.ctx as never,
      VIDEO_TEAM_ID as never,
    ),
    { code: "FORBIDDEN", message: "You do not have access to this team." },
  );

  await assertDenialCode(
    requireVideoManagementAccess(member.ctx as never, "video_missing" as never),
    { code: "NOT_FOUND", message: "Video not found." },
  );
});

