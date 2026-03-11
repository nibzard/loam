# Loam Staging And Environment Separation Guide

This guide explains how to set up safe environment separation for `loam`.

The goal is to avoid using production credentials for local development and to
introduce a proper staging environment.

Recommended environment model:

- `local`
- `staging`
- `production`

For this stack, the correct split is:

- Vercel
  - `Preview` = staging
  - `Production` = production
- Convex
  - `dev` = local
  - `staging` = pre-production QA
  - `prod` = production
- Clerk
  - development instance = local and staging
  - production instance = production
- Stripe
  - test mode = local and staging
  - live mode = production
- Railway
  - separate staging bucket
  - separate production bucket
- Mux
  - separate staging credentials if possible
  - production credentials only in production
- Resend
  - off or sandbox for local/staging
  - real sender for production

## 1. Why This Matters

Right now, using production keys locally is risky because local mistakes can:

- hit live Stripe billing
- hit live Clerk auth
- write to production Convex
- upload to production Railway storage
- create production Mux assets
- send real emails through Resend

The purpose of this setup is to make local and staging safe by default.

## 2. Recommended Environment Matrix

### Local

Use:

- Clerk development instance
- Stripe test mode
- Convex dev deployment
- staging/dev Railway bucket
- staging/dev Mux credentials
- no production deploy key

### Staging

Use:

- Clerk development instance
- Stripe test mode
- Convex staging deployment
- staging Railway bucket
- staging Mux credentials
- optional staging Resend config

### Production

Use:

- Clerk production instance
- Stripe live mode
- Convex production deployment
- production Railway bucket
- production Mux credentials
- production Resend config

## 3. Domain Plan

Recommended:

- production: `https://loam.video`
- staging: `https://staging.loam.video`
- local: `http://localhost:5296`

## 4. Local Environment Setup

For this repo, local env vars should live in:

- `.env.local`

The `env/` folder is not loaded automatically.

### 4.1 Local `.env.local` should use non-production values

Use:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_ISSUER_DOMAIN=https://<your-dev-clerk-domain>

CONVEX_DEPLOYMENT=dev:...
VITE_CONVEX_URL=https://<your-dev-convex>.convex.cloud
VITE_CONVEX_SITE_URL=https://staging.loam.video
APP_SITE_URL=https://staging.loam.video

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_WEBHOOK_SECRET=...

RAILWAY_ACCESS_KEY_ID=...
RAILWAY_SECRET_ACCESS_KEY=...
RAILWAY_ENDPOINT=https://...
RAILWAY_BUCKET_NAME=<staging-bucket>
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true

RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=
```

### 4.2 Important local rule

Do not keep the production `CONVEX_DEPLOY_KEY` in `.env.local` unless you
intentionally want CLI commands to target production.

That key changes how Convex CLI resolves deployments.

## 5. Clerk Staging Setup

Use the Clerk development instance for:

- local
- staging

Use the Clerk production instance only for:

- production

### 5.1 Development instance

Add allowed domains/origins such as:

- `http://localhost:5296`
- `https://staging.loam.video`
- temporary Vercel preview URLs if needed

Use:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_ISSUER_DOMAIN=https://<dev-clerk-issuer>
```

### 5.2 Production instance

Use:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_JWT_ISSUER_DOMAIN=https://clerk.loam.video
```

## 6. Stripe Staging Setup

Use Stripe test mode for:

- local
- staging

Use Stripe live mode only for:

- production

### 6.1 Create staging/test prices

In Stripe test mode, create:

- Starter `$15/month`
- Pro `$49/month`

Store:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

Important:

- use `price_...`
- do not use `prod_...`

### 6.2 Staging Stripe webhook

After staging Convex exists, create:

```text
https://<staging-convex>.convex.site/stripe/webhook
```

Subscribe at minimum to:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Save:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 7. Convex Staging Setup

### 7.1 Use a stable staging deployment

Recommended:

- create a separate permanent staging Convex project or deployment

This is safer than relying only on short-lived preview deployments.

### 7.2 Staging Convex env vars

Set these on staging Convex:

```env
APP_SITE_URL=https://staging.loam.video
VITE_CONVEX_SITE_URL=https://staging.loam.video
CLERK_JWT_ISSUER_DOMAIN=https://<dev-clerk-issuer>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_WEBHOOK_SECRET=...

RAILWAY_ACCESS_KEY_ID=...
RAILWAY_SECRET_ACCESS_KEY=...
RAILWAY_ENDPOINT=https://...
RAILWAY_BUCKET_NAME=<staging-bucket>
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true

RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=
```

### 7.3 Production Convex stays separate

Production Convex should keep:

- `APP_SITE_URL=https://loam.video`
- `VITE_CONVEX_SITE_URL=https://loam.video`
- production Clerk issuer
- Stripe live values
- Railway prod bucket
- Mux prod credentials
- production webhook secrets

## 8. Railway Staging Setup

Create a separate Railway bucket for staging.

Use different values than production:

```env
RAILWAY_ACCESS_KEY_ID=...
RAILWAY_SECRET_ACCESS_KEY=...
RAILWAY_ENDPOINT=https://...
RAILWAY_BUCKET_NAME=<staging-bucket>
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true
```

Leave `RAILWAY_PUBLIC_URL` unset unless you actually have a separate public
bucket base URL.

## 9. Mux Staging Setup

Best setup:

- use separate Mux credentials for staging

Store:

```env
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
```

Create staging webhook:

```text
https://<staging-convex>.convex.site/webhooks/mux
```

Store:

```env
MUX_WEBHOOK_SECRET=...
```

Production Mux credentials should remain production-only.

## 10. Resend Staging Setup

Recommended options:

- local: disable
- staging: disable or use a staging sender
- production: real sender

If you want staging email:

```env
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=Loam Staging <notify@staging.loam.video>
```

If not, just leave those unset in staging.

## 11. Vercel Preview And Production Setup

Use Vercel environments correctly:

- `Preview` = staging
- `Production` = production

### 11.1 Production Vercel env vars

Set:

```text
CONVEX_DEPLOY_KEY
VITE_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
VITE_CONVEX_SITE_URL=https://loam.video
```

### 11.2 Preview Vercel env vars

Set:

```text
CONVEX_DEPLOY_KEY
VITE_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
VITE_CONVEX_SITE_URL=https://staging.loam.video
```

Where Preview values should be:

- staging Convex deploy key
- Clerk dev/test keys

Do not manually set `VITE_CONVEX_URL`.

## 12. Vercel Domain Setup

Keep:

- `loam.video` -> production

Add:

- `staging.loam.video` -> staging / preview deployment

Recommended branch strategy:

- `main` -> production
- `staging` -> staging

## 13. Webhook Separation

Do not share webhooks across environments.

### Staging webhooks

Use staging endpoints:

- Stripe test webhook -> staging Convex
- Mux staging webhook -> staging Convex

### Production webhooks

Use production endpoints:

- Stripe live webhook -> production Convex
- Mux production webhook -> production Convex

## 14. Safe Deployment Flow

### Local

```bash
bun install
bun run typecheck
bun run typecheck:convex
bun run lint
```

### Staging deploy

From the staging branch or preview workflow:

```bash
vercel
```

This should use:

- Vercel Preview env vars
- staging Convex deploy key
- staging Clerk
- Stripe test mode

### Production deploy

From `main`:

```bash
vercel --prod
```

This should use:

- Vercel Production env vars
- production Convex deploy key
- production Clerk
- Stripe live mode

## 15. Validation Checklist

### Local validation

Check:

- Clerk dev auth works
- local app talks to Convex dev
- uploads do not go to production storage
- billing uses Stripe test mode

### Staging validation

Check:

- sign in works with Clerk dev
- team creation works
- Stripe test checkout works
- Railway uploads go to staging bucket
- Mux staging webhook succeeds
- no production emails are sent unless intended

### Production validation

Check:

- sign in works with Clerk prod
- live billing works
- uploads go to production bucket
- Mux prod webhook succeeds
- Stripe prod webhook succeeds
- emails are sent from production sender

## 16. Biggest Mistakes To Avoid

- keeping prod keys in `.env.local`
- using live Stripe in staging
- pointing staging webhooks at production Convex
- using the same Railway bucket for staging and production
- using production Clerk keys in Vercel Preview
- forgetting that `CONVEX_DEPLOY_KEY` can override normal Convex CLI targeting

## 17. Recommended Next Actions For This Repo

To fully clean up the current state:

1. Replace local `.env.local` with non-production values
2. Create a stable staging Convex environment
3. Create a staging Railway bucket
4. Create Stripe test prices
5. Configure Vercel Preview env vars
6. Add `staging.loam.video` in Vercel
7. Create staging Stripe and Mux webhooks

## 18. Minimum Acceptable Version

If you want the shortest safe upgrade path:

1. local uses Clerk dev, Stripe test, Convex dev
2. Vercel Preview uses staging Convex and Stripe test
3. Vercel Production keeps the current live setup

That is the minimum split that prevents most dangerous mistakes.
