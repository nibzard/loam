import assert from "node:assert/strict";
import test from "node:test";

import {
  issueShareAccessGrant,
  resolveActiveShareGrant,
} from "./shareAccess";

type ShareAccessGrantRecord = {
  _id: string;
  createdAt: number;
  expiresAt: number;
  shareLinkId: string;
  token: string;
};

type ShareLinkRecord = {
  _id: string;
  expiresAt?: number | null;
};

function createShareAccessCtx({
  grantsByLink = {},
  grantsByToken = {},
  shareLinksById = {},
}: {
  grantsByLink?: Record<string, ShareAccessGrantRecord[]>;
  grantsByToken?: Record<string, ShareAccessGrantRecord>;
  shareLinksById?: Record<string, ShareLinkRecord>;
}) {
  const deletedIds: string[] = [];
  const inserted: Array<{ tableName: string; value: Record<string, unknown> }> = [];

  return {
    ctx: {
      db: {
        delete: async (id: string) => {
          deletedIds.push(id);
        },
        get: async (id: string) => shareLinksById[id] ?? null,
        insert: async (tableName: string, value: Record<string, unknown>) => {
          inserted.push({ tableName, value });
        },
        query: (tableName: "shareAccessGrants") => ({
          withIndex: (
            indexName: "by_share_link" | "by_token",
            apply: (q: { eq: (_field: string, value: string) => string }) => string,
          ) => {
            const key = apply({
              eq: (_field, value) => value,
            });

            if (tableName !== "shareAccessGrants") {
              throw new Error(`Unexpected table ${tableName}`);
            }

            if (indexName === "by_share_link") {
              return {
                collect: async () => grantsByLink[key] ?? [],
              };
            }

            return {
              unique: async () => grantsByToken[key] ?? null,
            };
          },
        }),
      },
    },
    deletedIds,
    inserted,
  };
}

test("issueShareAccessGrant deletes expired grants for the link before inserting a new token", async () => {
  const now = 1_700_000_000_000;
  const previousNow = Date.now;
  Date.now = () => now;

  try {
    const { ctx, deletedIds, inserted } = createShareAccessCtx({
      grantsByLink: {
        share_link_123: [
          {
            _id: "grant_expired",
            createdAt: now - 10_000,
            expiresAt: now - 1,
            shareLinkId: "share_link_123",
            token: "expired_token",
          },
          {
            _id: "grant_active",
            createdAt: now - 5_000,
            expiresAt: now + 10_000,
            shareLinkId: "share_link_123",
            token: "active_token",
          },
        ],
      },
    });

    const grantToken = await issueShareAccessGrant(
      ctx as never,
      "share_link_123" as never,
      120_000,
    );

    assert.deepEqual(deletedIds, ["grant_expired"]);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.tableName, "shareAccessGrants");
    assert.equal(grantToken, inserted[0]?.value.token);
    assert.equal(typeof grantToken, "string");
    assert.equal(grantToken.length, 40);
    assert.deepEqual(inserted[0]?.value, {
      createdAt: now,
      expiresAt: now + 120_000,
      shareLinkId: "share_link_123",
      token: grantToken,
    });
  } finally {
    Date.now = previousNow;
  }
});

test("resolveActiveShareGrant returns the active grant and share link when both are still valid", async () => {
  const now = 1_700_000_000_000;
  const previousNow = Date.now;
  Date.now = () => now;

  try {
    const grant = {
      _id: "grant_123",
      createdAt: now - 10_000,
      expiresAt: now + 60_000,
      shareLinkId: "share_link_123",
      token: "grant_token_123",
    };
    const shareLink = {
      _id: "share_link_123",
      expiresAt: now + 120_000,
    };
    const { ctx } = createShareAccessCtx({
      grantsByToken: {
        grant_token_123: grant,
      },
      shareLinksById: {
        share_link_123: shareLink,
      },
    });

    const resolved = await resolveActiveShareGrant(ctx as never, "grant_token_123");

    assert.deepEqual(resolved, {
      grant,
      shareLink,
    });
  } finally {
    Date.now = previousNow;
  }
});

test("resolveActiveShareGrant rejects missing, expired, and dangling grants", async () => {
  const now = 1_700_000_000_000;
  const previousNow = Date.now;
  Date.now = () => now;

  try {
    const scenarios = [
      {
        grantsByToken: {},
        expected: null,
        shareLinksById: {},
        token: "missing",
      },
      {
        grantsByToken: {
          expired: {
            _id: "grant_expired",
            createdAt: now - 10_000,
            expiresAt: now,
            shareLinkId: "share_link_123",
            token: "expired",
          },
        },
        expected: null,
        shareLinksById: {
          share_link_123: { _id: "share_link_123", expiresAt: now + 1_000 },
        },
        token: "expired",
      },
      {
        grantsByToken: {
          dangling: {
            _id: "grant_dangling",
            createdAt: now - 10_000,
            expiresAt: now + 1_000,
            shareLinkId: "share_link_missing",
            token: "dangling",
          },
        },
        expected: null,
        shareLinksById: {},
        token: "dangling",
      },
      {
        grantsByToken: {
          share_expired: {
            _id: "grant_share_expired",
            createdAt: now - 10_000,
            expiresAt: now + 1_000,
            shareLinkId: "share_link_123",
            token: "share_expired",
          },
        },
        expected: null,
        shareLinksById: {
          share_link_123: { _id: "share_link_123", expiresAt: now },
        },
        token: "share_expired",
      },
    ] as const;

    for (const scenario of scenarios) {
      const { ctx } = createShareAccessCtx({
        grantsByToken: scenario.grantsByToken,
        shareLinksById: scenario.shareLinksById,
      });
      const resolved = await resolveActiveShareGrant(ctx as never, scenario.token);
      assert.equal(resolved, scenario.expected);
    }
  } finally {
    Date.now = previousNow;
  }
});
