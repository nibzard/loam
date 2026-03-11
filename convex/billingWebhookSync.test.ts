import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeamSubscriptionWebhookPatch,
  syncTeamSubscriptionFromWebhookWithCtx,
} from "./billingWebhookSync";

function createBillingSyncCtx({
  teamsByCustomerId = {},
  teamsById = {},
  teamsBySubscriptionId = {},
}: {
  teamsByCustomerId?: Record<string, Record<string, unknown>>;
  teamsById?: Record<string, Record<string, unknown>>;
  teamsBySubscriptionId?: Record<string, Record<string, unknown>>;
}) {
  const patches: Array<{ id: string; value: Record<string, unknown> }> = [];
  const lookups = {
    customer: [] as string[],
    get: [] as string[],
    normalize: [] as string[],
    subscription: [] as string[],
  };

  return {
    ctx: {
      db: {
        get: async (id: string) => {
          lookups.get.push(id);
          return (teamsById[id] as never) ?? null;
        },
        normalizeId: (_tableName: "teams", id: string) => {
          lookups.normalize.push(id);
          return id in teamsById ? id : null;
        },
        patch: async (id: string, value: Record<string, unknown>) => {
          patches.push({ id, value });
        },
        query: () => ({
          withIndex: (
            indexName: "by_stripe_subscription_id" | "by_stripe_customer_id",
            apply: (q: { eq: (_field: string, value: string) => string }) => string,
          ) => {
            const key = apply({
              eq: (_field, value) => value,
            });
            return {
              unique: async () => {
                if (indexName === "by_stripe_subscription_id") {
                  lookups.subscription.push(key);
                  return (teamsBySubscriptionId[key] as never) ?? null;
                }

                lookups.customer.push(key);
                return (teamsByCustomerId[key] as never) ?? null;
              },
            };
          },
        }),
      },
    },
    lookups,
    patches,
  };
}

test("buildTeamSubscriptionWebhookPatch maps Stripe prices and preserves existing fallback values", () => {
  const previousBasic = process.env.STRIPE_PRICE_BASIC_MONTHLY;
  const previousPro = process.env.STRIPE_PRICE_PRO_MONTHLY;
  process.env.STRIPE_PRICE_BASIC_MONTHLY = "price_basic";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";

  try {
    assert.deepEqual(
      buildTeamSubscriptionWebhookPatch(
        {
          _id: "team_123",
          plan: "team",
          stripeCustomerId: "cus_old",
          stripePriceId: "price_old",
          stripeSubscriptionId: "sub_old",
        },
        {
          status: "active",
          stripePriceId: "price_pro",
          stripeSubscriptionId: "sub_new",
        },
      ),
      {
        billingStatus: "active",
        plan: "pro",
        stripeCustomerId: "cus_old",
        stripePriceId: "price_pro",
        stripeSubscriptionId: "sub_new",
      },
    );
  } finally {
    process.env.STRIPE_PRICE_BASIC_MONTHLY = previousBasic;
    process.env.STRIPE_PRICE_PRO_MONTHLY = previousPro;
  }
});

test("Stripe webhook sync prefers org id lookup before subscription and customer fallbacks", async () => {
  const previousBasic = process.env.STRIPE_PRICE_BASIC_MONTHLY;
  const previousPro = process.env.STRIPE_PRICE_PRO_MONTHLY;
  process.env.STRIPE_PRICE_BASIC_MONTHLY = "price_basic";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";

  try {
    const { ctx, lookups, patches } = createBillingSyncCtx({
      teamsById: {
        team_123: {
          _id: "team_123",
          plan: "free",
          stripeCustomerId: "cus_old",
          stripePriceId: "price_old",
        },
      },
      teamsBySubscriptionId: {
        sub_123: {
          _id: "team_should_not_be_used",
          plan: "basic",
        },
      },
    });

    const result = await syncTeamSubscriptionFromWebhookWithCtx(ctx as never, {
      orgId: "team_123",
      status: "trialing",
      stripeCustomerId: "cus_new",
      stripePriceId: "price_pro",
      stripeSubscriptionId: "sub_123",
    });

    assert.equal(result, null);
    assert.deepEqual(lookups.normalize, ["team_123"]);
    assert.deepEqual(lookups.get, ["team_123"]);
    assert.deepEqual(lookups.subscription, []);
    assert.deepEqual(lookups.customer, []);
    assert.deepEqual(patches, [
      {
        id: "team_123",
        value: {
          billingStatus: "trialing",
          plan: "pro",
          stripeCustomerId: "cus_new",
          stripePriceId: "price_pro",
          stripeSubscriptionId: "sub_123",
        },
      },
    ]);
  } finally {
    process.env.STRIPE_PRICE_BASIC_MONTHLY = previousBasic;
    process.env.STRIPE_PRICE_PRO_MONTHLY = previousPro;
  }
});

test("Stripe webhook sync falls back to subscription id then customer id and skips unknown teams", async () => {
  const previousBasic = process.env.STRIPE_PRICE_BASIC_MONTHLY;
  const previousPro = process.env.STRIPE_PRICE_PRO_MONTHLY;
  process.env.STRIPE_PRICE_BASIC_MONTHLY = "price_basic";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";

  try {
    const subscriptionLookup = createBillingSyncCtx({
      teamsBySubscriptionId: {
        sub_456: {
          _id: "team_456",
          plan: "team",
          stripeCustomerId: "cus_old",
          stripePriceId: "price_old",
        },
      },
    });

    await syncTeamSubscriptionFromWebhookWithCtx(subscriptionLookup.ctx as never, {
      orgId: "missing_team",
      status: "past_due",
      stripeSubscriptionId: "sub_456",
    });

    assert.deepEqual(subscriptionLookup.lookups.normalize, ["missing_team"]);
    assert.deepEqual(subscriptionLookup.lookups.get, []);
    assert.deepEqual(subscriptionLookup.lookups.subscription, ["sub_456"]);
    assert.deepEqual(subscriptionLookup.lookups.customer, []);
    assert.deepEqual(subscriptionLookup.patches, [
      {
        id: "team_456",
        value: {
          billingStatus: "past_due",
          plan: "pro",
          stripeCustomerId: "cus_old",
          stripePriceId: "price_old",
          stripeSubscriptionId: "sub_456",
        },
      },
    ]);

    const customerLookup = createBillingSyncCtx({
      teamsByCustomerId: {
        cus_789: {
          _id: "team_789",
          plan: "basic",
          stripeCustomerId: "cus_789",
        },
      },
    });

    await syncTeamSubscriptionFromWebhookWithCtx(customerLookup.ctx as never, {
      status: "canceled",
      stripeCustomerId: "cus_789",
      stripeSubscriptionId: "sub_missing",
    });

    assert.deepEqual(customerLookup.lookups.subscription, ["sub_missing"]);
    assert.deepEqual(customerLookup.lookups.customer, ["cus_789"]);
    assert.deepEqual(customerLookup.patches, [
      {
        id: "team_789",
        value: {
          billingStatus: "canceled",
          plan: "basic",
          stripeCustomerId: "cus_789",
          stripePriceId: undefined,
          stripeSubscriptionId: "sub_missing",
        },
      },
    ]);

    const missingLookup = createBillingSyncCtx({});
    const result = await syncTeamSubscriptionFromWebhookWithCtx(missingLookup.ctx as never, {
      status: "active",
      stripeCustomerId: "cus_missing",
      stripeSubscriptionId: "sub_missing",
    });

    assert.equal(result, null);
    assert.deepEqual(missingLookup.patches, []);
  } finally {
    process.env.STRIPE_PRICE_BASIC_MONTHLY = previousBasic;
    process.env.STRIPE_PRICE_PRO_MONTHLY = previousPro;
  }
});
