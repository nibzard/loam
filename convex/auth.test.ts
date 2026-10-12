import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageVideoSharing,
  canTeamMemberAccessVideoWithGrantSet,
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

