import test from "node:test";
import assert from "node:assert/strict";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";

import { api } from "@convex/_generated/api";
import { resetPrewarmDedupeForTests } from "@/lib/convexRouteData";

import {
  loadShareRouteBootstrap,
  loadWatchRouteBootstrap,
} from "./-publicPlaybackLoaders";

function createMockClient({
  queryImpl,
  actionImpl,
}: {
  queryImpl?: (name: string, args: unknown) => Promise<unknown>;
  actionImpl?: (name: string, args: unknown) => Promise<unknown>;
}) {
  const calls = {
    action: [] as Array<{ args: unknown; name: string }>,
    prewarm: [] as Array<{ args: unknown; name: string }>,
    query: [] as Array<{ args: unknown; name: string }>,
  };

  const client = {
    action: async (actionRef: unknown, args: unknown) => {
      const name = getFunctionName(actionRef as never);
      calls.action.push({ args, name });
      if (!actionImpl) {
        throw new Error(`Unexpected action ${name}`);
      }
      return await actionImpl(name, args);
    },
    prewarmQuery: ({ query, args }: { args: unknown; query: unknown }) => {
      calls.prewarm.push({
        args,
        name: getFunctionName(query as never),
      });
    },
    query: async (queryRef: unknown, args: unknown) => {
      const name = getFunctionName(queryRef as never);
      calls.query.push({ args, name });
      if (!queryImpl) {
        throw new Error(`Unexpected query ${name}`);
      }
      return await queryImpl(name, args);
    },
  } as unknown as ConvexReactClient;

  return { calls, client };
}

test("watch route loader prewarms public queries and fetches a single bootstrap action", async () => {
  resetPrewarmDedupeForTests();

  const expectedBootstrap = {
    state: "ready" as const,
    playbackSession: {
      accessMode: "public" as const,
      expiresAt: null,
      posterUrl: "https://image.mux.com/poster.jpg",
      url: "https://stream.mux.com/video.m3u8",
    },
    videoData: {
      video: {
        _id: "video_123" as never,
        title: "Public video",
      },
    },
  };

  const { calls, client } = createMockClient({
    actionImpl: async (name) => {
      assert.equal(name, getFunctionName(api.videoActions.getPublicWatchBootstrap));
      return expectedBootstrap;
    },
  });

  const result = await loadWatchRouteBootstrap(client, { publicId: "public_123" });

  assert.deepEqual(result, expectedBootstrap);
  assert.deepEqual(calls.action, [
    {
      args: { publicId: "public_123" },
      name: getFunctionName(api.videoActions.getPublicWatchBootstrap),
    },
  ]);
  assert.deepEqual(
    calls.prewarm.map((call) => call.name).sort(),
    [
      "comments:getThreadedForPublic",
      "reactions:listForPublic",
      "videos:getByPublicId",
    ],
  );
});

test("share route preload resolves password state without issuing a grant action", async () => {
  resetPrewarmDedupeForTests();

  const { calls, client } = createMockClient({
    queryImpl: async (name) => {
      assert.equal(name, getFunctionName(api.shareLinks.getByToken));
      return { status: "requiresPassword" as const };
    },
  });

  const result = await loadShareRouteBootstrap(client, {
    token: "share_123",
    preload: true,
  });

  assert.deepEqual(result, { state: "passwordRequired" });
  assert.equal(calls.action.length, 0);
  assert.deepEqual(
    calls.prewarm.map((call) => call.name),
    [getFunctionName(api.shareLinks.getByToken)],
  );
});

test("share route preload maps each non-ready share status without issuing actions", async () => {
  const statuses = [
    { shareStatus: "missing" as const, expectedState: "missing" as const },
    { shareStatus: "expired" as const, expectedState: "expired" as const },
    { shareStatus: "processing" as const, expectedState: "processing" as const },
    { shareStatus: "failed" as const, expectedState: "failed" as const },
  ];

  for (const { shareStatus, expectedState } of statuses) {
    resetPrewarmDedupeForTests();

    const { calls, client } = createMockClient({
      queryImpl: async (name) => {
        assert.equal(name, getFunctionName(api.shareLinks.getByToken));
        return { status: shareStatus };
      },
    });

    const result = await loadShareRouteBootstrap(client, {
      token: `share_${shareStatus}`,
      preload: true,
    });

    assert.deepEqual(result, { state: expectedState });
    assert.equal(calls.action.length, 0);
    assert.deepEqual(
      calls.prewarm.map((call) => call.name),
      [getFunctionName(api.shareLinks.getByToken)],
    );
  }
});

test("share route preload keeps ready shares in a non-mutating bootstrapping state", async () => {
  resetPrewarmDedupeForTests();

  const { calls, client } = createMockClient({
    queryImpl: async (name) => {
      assert.equal(name, getFunctionName(api.shareLinks.getByToken));
      return { status: "ok" as const };
    },
  });

  const result = await loadShareRouteBootstrap(client, {
    token: "share_123",
    preload: true,
  });

  assert.deepEqual(result, { state: "bootstrapping" });
  assert.equal(calls.action.length, 0);
});

test("share route enter fetches bootstrap once and prewarms granted queries", async () => {
  resetPrewarmDedupeForTests();

  const expectedBootstrap = {
    state: "ready" as const,
    grantToken: "grant_123",
    playbackSession: {
      accessMode: "signed" as const,
      expiresAt: Date.now() + 60_000,
      posterUrl: "https://image.mux.com/poster.jpg",
      url: "https://stream.mux.com/video.m3u8",
    },
    videoData: {
      video: {
        _id: "video_123" as never,
        title: "Shared video",
      },
    },
  };

  const { calls, client } = createMockClient({
    actionImpl: async (name) => {
      assert.equal(name, getFunctionName(api.videoActions.getSharePlaybackBootstrap));
      return expectedBootstrap;
    },
  });

  const result = await loadShareRouteBootstrap(client, {
    token: "share_123",
    preload: false,
  });

  assert.deepEqual(result, expectedBootstrap);
  assert.deepEqual(calls.action, [
    {
      args: { token: "share_123" },
      name: getFunctionName(api.videoActions.getSharePlaybackBootstrap),
    },
  ]);
  assert.deepEqual(
    calls.prewarm.map((call) => call.name).sort(),
    [
      "comments:getThreadedForShareGrant",
      "reactions:listForShareGrant",
      "shareLinks:getByToken",
      "videos:getByShareGrant",
    ],
  );
});

test("share route enter does not prewarm grant queries when bootstrap is not ready", async () => {
  resetPrewarmDedupeForTests();

  const { calls, client } = createMockClient({
    actionImpl: async (name) => {
      assert.equal(name, getFunctionName(api.videoActions.getSharePlaybackBootstrap));
      return { state: "expired" as const };
    },
  });

  const result = await loadShareRouteBootstrap(client, {
    token: "share_123",
    preload: false,
  });

  assert.deepEqual(result, { state: "expired" });
  assert.deepEqual(
    calls.prewarm.map((call) => call.name),
    [getFunctionName(api.shareLinks.getByToken)],
  );
});
