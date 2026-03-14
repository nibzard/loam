import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";

import { internal } from "./_generated/api";
import { processMuxWebhookEvent } from "./muxActions";

function createMockWebhookCtx({
  mutationImpl,
  queryImpl,
}: {
  mutationImpl?: (name: string, args: unknown) => Promise<unknown>;
  queryImpl?: (name: string, args: unknown) => Promise<unknown>;
}) {
  const calls = {
    mutation: [] as Array<{ args: unknown; name: string }>,
    query: [] as Array<{ args: unknown; name: string }>,
    schedule: [] as Array<{ args: unknown; delayMs: number; name: string }>,
  };

  const ctx = {
    runMutation: async (mutationRef: unknown, args: unknown) => {
      const name = getFunctionName(mutationRef as never);
      calls.mutation.push({ args, name });
      if (!mutationImpl) {
        throw new Error(`Unexpected mutation ${name}`);
      }
      return await mutationImpl(name, args);
    },
    runQuery: async (queryRef: unknown, args: unknown) => {
      const name = getFunctionName(queryRef as never);
      calls.query.push({ args, name });
      if (!queryImpl) {
        throw new Error(`Unexpected query ${name}`);
      }
      return await queryImpl(name, args);
    },
    scheduler: {
      runAfter: async (delayMs: number, actionRef: unknown, args: unknown) => {
        calls.schedule.push({
          args,
          delayMs,
          name: getFunctionName(actionRef as never),
        });
      },
    },
  };

  return { calls, ctx };
}

test("video.asset.ready falls back to asset lookup and schedules cleanup for stale transitions", async () => {
  const muxAssetLookups: string[] = [];
  const { calls, ctx } = createMockWebhookCtx({
    queryImpl: async (name) => {
      assert.equal(name, getFunctionName(internal.videos.getVideoByMuxAssetId));
      return null;
    },
    mutationImpl: async (name) => {
      assert.equal(name, getFunctionName(internal.videos.markAsReady));
      return { applied: false };
    },
  });

  await processMuxWebhookEvent(
    ctx as never,
    {
      type: "video.asset.ready",
      data: {
        id: "asset_123",
      },
    },
    {
      getMuxAsset: async (assetId) => {
        muxAssetLookups.push(assetId);
        return {
          duration: 12,
          passthrough: "upload_v1:video_123:session_123",
          playback_ids: [{ id: "playback_signed_123", policy: "signed" }],
        } as never;
      },
    },
  );

  assert.deepEqual(muxAssetLookups, ["asset_123"]);
  assert.deepEqual(calls.query, [
    {
      args: { muxAssetId: "asset_123" },
      name: getFunctionName(internal.videos.getVideoByMuxAssetId),
    },
  ]);
  assert.deepEqual(calls.mutation, [
    {
      args: {
        allowLegacyWithoutSession: undefined,
        duration: 12,
        muxAssetId: "asset_123",
        muxPlaybackId: "playback_signed_123",
        thumbnailUrl: undefined,
        uploadSessionToken: "session_123",
        videoId: "video_123",
      },
      name: getFunctionName(internal.videos.markAsReady),
    },
  ]);
  assert.deepEqual(calls.schedule, [
    {
      args: {
        muxAssetId: "asset_123",
        reason: "stale_mux_webhook_asset_ready",
        videoId: "video_123",
      },
      delayMs: 0,
      name: getFunctionName(internal.videoActions.cleanupDeletedVideoAssets),
    },
  ]);
});

test("video.asset.errored keeps the error message and schedules cleanup for stale failures", async () => {
  const { calls, ctx } = createMockWebhookCtx({
    queryImpl: async (name) => {
      assert.equal(name, getFunctionName(internal.videos.getVideoByMuxAssetId));
      return null;
    },
    mutationImpl: async (name) => {
      assert.equal(name, getFunctionName(internal.videos.markAsFailed));
      return { outcome: "stale" };
    },
  });

  await processMuxWebhookEvent(ctx as never, {
    type: "video.asset.errored",
    data: {
      asset_id: "asset_456",
      errors: [{ message: "Mux could not transcode the upload." }],
      passthrough: "upload_v1:video_456:session_456",
    },
  });

  assert.deepEqual(calls.query, [
    {
      args: { muxAssetId: "asset_456" },
      name: getFunctionName(internal.videos.getVideoByMuxAssetId),
    },
  ]);
  assert.deepEqual(calls.mutation, [
    {
      args: {
        allowLegacyWithoutSession: undefined,
        allowProcessingFailure: true,
        muxAssetId: "asset_456",
        uploadError: "Mux could not transcode the upload.",
        uploadSessionToken: "session_456",
        videoId: "video_456",
      },
      name: getFunctionName(internal.videos.markAsFailed),
    },
  ]);
  assert.deepEqual(calls.schedule, [
    {
      args: {
        muxAssetId: "asset_456",
        reason: "stale_mux_webhook_asset_errored",
        videoId: "video_456",
      },
      delayMs: 0,
      name: getFunctionName(internal.videoActions.cleanupDeletedVideoAssets),
    },
  ]);
});
