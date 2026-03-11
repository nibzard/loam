import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import Stripe from "stripe";
import { api, components, internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { getIdentity, requireTeamAccess } from "./auth";
import {
  getStripePriceIdForPlan,
  getTeamStorageUsedBytes,
  getTeamSubscriptionState,
  hasActiveTeamSubscriptionStatus,
  TEAM_PLAN_MONTHLY_PRICE_USD,
  TEAM_PLAN_STORAGE_LIMIT_BYTES,
} from "./billingHelpers";
import { syncTeamSubscriptionFromWebhookWithCtx } from "./billingWebhookSync";

const stripeClient = new StripeSubscriptions(components.stripe, {});
const stripe = new Stripe(stripeClient.apiKey);
const TEAM_TRIAL_DAYS = 7;
const DEFAULT_APP_SITE_URL = "https://loam.video";
const DEFAULT_WWW_APP_SITE_URL = "https://www.loam.video";

const DEV_ALLOWED_REDIRECT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5296",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5296",
];

const teamPlanValidator = v.union(v.literal("basic"), v.literal("pro"));
const teamRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);

function parseAllowedOrigin(input: string | undefined | null): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function addOriginVariants(origins: Set<string>, input: string | undefined | null) {
  const origin = parseAllowedOrigin(input);
  if (!origin) return;

  origins.add(origin);

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") return;

    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
      origins.add(parsed.origin);
      return;
    }

    parsed.hostname = `www.${parsed.hostname}`;
    origins.add(parsed.origin);
  } catch {
    // Ignore malformed variant expansion and keep the parsed origin.
  }
}

function getAllowedRedirectOrigins() {
  const origins = new Set<string>();

  addOriginVariants(origins, process.env.APP_SITE_URL);
  addOriginVariants(origins, process.env.VITE_CONVEX_SITE_URL);
  addOriginVariants(origins, DEFAULT_APP_SITE_URL);
  addOriginVariants(origins, DEFAULT_WWW_APP_SITE_URL);

  for (const origin of DEV_ALLOWED_REDIRECT_ORIGINS) {
    origins.add(origin);
  }

  return origins;
}

function assertAllowedRedirectUrl(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty absolute URL.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${fieldName} must use http or https.`);
  }

  const allowedOrigins = getAllowedRedirectOrigins();
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error(`${fieldName} origin is not allowed.`);
  }

  return parsed.toString();
}

export const createSubscriptionCheckout = action({
  args: {
    teamId: v.id("teams"),
    plan: teamPlanValidator,
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<{ sessionId: string; url: string | null }> => {
    const successUrl = assertAllowedRedirectUrl(args.successUrl, "successUrl");
    const cancelUrl = assertAllowedRedirectUrl(args.cancelUrl, "cancelUrl");

    const identity = await getIdentity(ctx);
    const team = await ctx.runQuery(api.teams.get, { teamId: args.teamId });

    if (!team) {
      throw new Error("Team not found");
    }

    if (team.role !== "owner") {
      throw new Error("Only team owners can manage billing.");
    }

    const existingSubscription = await ctx.runQuery(
      components.stripe.public.getSubscriptionByOrgId,
      { orgId: args.teamId },
    );

    if (existingSubscription && hasActiveTeamSubscriptionStatus(existingSubscription.status)) {
      throw new Error(
        "This team already has an active subscription. Use the billing portal to manage it.",
      );
    }

    let stripeCustomerId: string | undefined =
      team.stripeCustomerId ?? existingSubscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const userEmail =
        typeof identity.email === "string" && identity.email.length > 0
          ? identity.email
          : undefined;
      const customer = await stripeClient.createCustomer(ctx, {
        email: userEmail,
        name: team.name,
        metadata: {
          orgId: team._id,
          userId: identity.subject,
          teamSlug: team.slug,
        },
        idempotencyKey: team._id,
      });
      stripeCustomerId = customer.customerId;

      await ctx.runMutation(internal.teams.linkStripeCustomer, {
        teamId: team._id,
        stripeCustomerId,
      });
    }

    const stripePriceId = getStripePriceIdForPlan(args.plan);

    const shouldStartTrial =
      !existingSubscription && !team.stripeSubscriptionId;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orgId: team._id,
        plan: args.plan,
      },
      subscription_data: {
        metadata: {
          orgId: team._id,
          userId: identity.subject,
          plan: args.plan,
          teamSlug: team.slug,
        },
        ...(shouldStartTrial ? { trial_period_days: TEAM_TRIAL_DAYS } : {}),
      },
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return {
      sessionId: session.id,
      url: session.url,
    };
  },
});

export const createCustomerPortalSession = action({
  args: {
    teamId: v.id("teams"),
    returnUrl: v.string(),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const returnUrl = assertAllowedRedirectUrl(args.returnUrl, "returnUrl");

    const team = await ctx.runQuery(api.teams.get, { teamId: args.teamId });

    if (!team) {
      throw new Error("Team not found");
    }

    if (team.role !== "owner") {
      throw new Error("Only team owners can manage billing.");
    }

    const existingSubscription = await ctx.runQuery(
      components.stripe.public.getSubscriptionByOrgId,
      { orgId: args.teamId },
    );

    const stripeCustomerId =
      team.stripeCustomerId ?? existingSubscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      throw new Error("No Stripe customer found for this team yet.");
    }

    return await stripeClient.createCustomerPortalSession(ctx, {
      customerId: stripeCustomerId,
      returnUrl,
    });
  },
});

export const getTeamBilling = query({
  args: {
    teamId: v.id("teams"),
  },
  returns: v.object({
    plan: teamPlanValidator,
    monthlyPriceUsd: v.number(),
    storageLimitBytes: v.number(),
    storageUsedBytes: v.number(),
    hasActiveSubscription: v.boolean(),
    subscriptionStatus: v.union(v.string(), v.null()),
    stripeCustomerId: v.union(v.string(), v.null()),
    stripeSubscriptionId: v.union(v.string(), v.null()),
    stripePriceId: v.union(v.string(), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    role: teamRoleValidator,
    canManageBilling: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { membership } = await requireTeamAccess(ctx, args.teamId);
    const subscriptionState = await getTeamSubscriptionState(ctx, args.teamId);
    const storageUsedBytes = await getTeamStorageUsedBytes(ctx, args.teamId);
    const subscription = subscriptionState.subscription;

    return {
      plan: subscriptionState.plan,
      monthlyPriceUsd: TEAM_PLAN_MONTHLY_PRICE_USD[subscriptionState.plan],
      storageLimitBytes: TEAM_PLAN_STORAGE_LIMIT_BYTES[subscriptionState.plan],
      storageUsedBytes,
      hasActiveSubscription: subscriptionState.hasActiveSubscription,
      subscriptionStatus:
        subscription?.status ?? subscriptionState.team.billingStatus ?? null,
      stripeCustomerId:
        subscriptionState.team.stripeCustomerId ??
        subscription?.stripeCustomerId ??
        null,
      stripeSubscriptionId:
        subscription?.stripeSubscriptionId ??
        subscriptionState.team.stripeSubscriptionId ??
        null,
      stripePriceId: subscription?.priceId ?? subscriptionState.team.stripePriceId ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      role: membership.role,
      canManageBilling: membership.role === "owner",
    };
  },
});

export const syncTeamSubscriptionFromWebhook = internalMutation({
  args: {
    orgId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.optional(v.string()),
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await syncTeamSubscriptionFromWebhookWithCtx(ctx as never, args);
  },
});
