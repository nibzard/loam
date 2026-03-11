import { normalizeStoredTeamPlan, resolvePlanFromStripePriceId } from "./billingHelpers";

type TeamRecord = {
  _id: string;
  billingStatus?: string | null;
  plan: string;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
};

type BillingWebhookSyncArgs = {
  orgId?: string;
  status: string;
  stripeCustomerId?: string;
  stripePriceId?: string;
  stripeSubscriptionId: string;
};

type BillingWebhookSyncCtx = {
  db: {
    get: (id: string) => Promise<TeamRecord | null>;
    normalizeId: (tableName: "teams", id: string) => string | null;
    patch: (id: string, value: Record<string, unknown>) => Promise<void>;
    query: (
      tableName: "teams",
    ) => {
      withIndex: (
        indexName: "by_stripe_subscription_id" | "by_stripe_customer_id",
        apply: (q: { eq: (_field: string, value: string) => string }) => string,
      ) => { unique: () => Promise<TeamRecord | null> };
    };
  };
};

export function buildTeamSubscriptionWebhookPatch(
  team: TeamRecord,
  args: BillingWebhookSyncArgs,
) {
  const mappedPlan = resolvePlanFromStripePriceId(args.stripePriceId);
  const normalizedStoredPlan = normalizeStoredTeamPlan(team.plan);

  return {
    billingStatus: args.status,
    plan: mappedPlan ?? normalizedStoredPlan,
    stripeCustomerId: args.stripeCustomerId ?? team.stripeCustomerId,
    stripePriceId: args.stripePriceId ?? team.stripePriceId,
    stripeSubscriptionId: args.stripeSubscriptionId,
  };
}

export async function syncTeamSubscriptionFromWebhookWithCtx(
  ctx: BillingWebhookSyncCtx,
  args: BillingWebhookSyncArgs,
) {
  const normalizedOrgId = args.orgId
    ? ctx.db.normalizeId("teams", args.orgId)
    : null;

  let team = normalizedOrgId ? await ctx.db.get(normalizedOrgId) : null;

  if (!team) {
    team = await ctx.db
      .query("teams")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();
  }

  if (!team && args.stripeCustomerId) {
    team = await ctx.db
      .query("teams")
      .withIndex("by_stripe_customer_id", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .unique();
  }

  if (!team) {
    return null;
  }

  await ctx.db.patch(team._id, buildTeamSubscriptionWebhookPatch(team, args));
  return null;
}
