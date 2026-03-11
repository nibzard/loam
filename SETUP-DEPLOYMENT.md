# Loam Deployment Setup Guide

This is the full repeatable setup guide for deploying `loam` from scratch.

It reflects the setup that was actually used for:

- production domain: `https://loam.video`
- frontend hosting: Vercel
- backend/database/functions: Convex
- auth: Clerk
- billing: Stripe
- video processing: Mux
- object storage: Railway bucket
- optional email notifications: Resend

Use this guide when you need to recreate production from zero.

## 1. Local Repo Preparation

### 1.1 Install dependencies

```bash
bun install
```

### 1.2 Use root `.env.local` for local env values

For this repo, local development env vars go in the project root `.env.local`.

Do not expect the `env/` folder to be loaded automatically.

The `env/` folder only contains example production env files:

- `env/convex.production.env.example`
- `env/vercel.production.env.example`

### 1.3 Canonical production domain

This repo is configured for:

- `https://loam.video`

The canonical production domain is used in:

- `src/lib/seo.ts`
- `convex/billing.ts`
- `public/robots.txt`
- `public/sitemap.xml`

If you deploy to a different domain, update those files first.

## 2. Required Accounts

Create or access these accounts:

- Vercel
- Convex
- Clerk
- Stripe
- Mux
- Railway
- Resend (optional)

## 3. Clerk Setup

### 3.1 Create the Clerk app

Create the app for the production site.

### 3.2 Configure the production domain

In Clerk, set up the production domain:

- `loam.video`

Also add any temporary Vercel domain you want to use during setup and testing.

### 3.3 Get the three Clerk values

You need:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

### 3.4 Where to find `CLERK_JWT_ISSUER_DOMAIN`

In Clerk dashboard:

1. Go to `JWT Templates`
2. Create or open the `Convex` template
3. Copy the `Issuer URL`

Production example:

```env
CLERK_JWT_ISSUER_DOMAIN=https://clerk.loam.video
```

### 3.5 Put Clerk values in `.env.local`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_JWT_ISSUER_DOMAIN=https://clerk.loam.video
```

Important:

- production Vercel must use `pk_live_...`, not `pk_test_...`
- production Vercel must use `sk_live_...`, not `sk_test_...`

## 4. Stripe Setup

### 4.1 Use live mode

Do this in Stripe live mode, not test mode.

### 4.2 Create the secret key

From Stripe API keys, copy:

```env
STRIPE_SECRET_KEY=sk_live_...
```

### 4.3 Create the products and recurring monthly prices

This app expects:

- Starter: `$15/month`
- Pro: `$49/month`

Those values come from `convex/billingHelpers.ts`.

Create:

1. Product `Starter`
2. Monthly recurring price for Starter
3. Product `Pro`
4. Monthly recurring price for Pro

### 4.4 Important: use Stripe Price IDs, not Product IDs

The app needs:

- `STRIPE_PRICE_BASIC_MONTHLY=price_...`
- `STRIPE_PRICE_PRO_MONTHLY=price_...`

Do not use:

- `prod_...`

`prod_...` is a Stripe product ID and will break checkout logic here.

### 4.5 Add to `.env.local`

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

### 4.6 Stripe webhook

After Convex production exists, create the webhook endpoint:

```text
https://tangible-impala-375.convex.site/stripe/webhook
```

Subscribe at minimum to:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the signing secret:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 5. Mux Setup

### 5.1 Create Mux API credentials

Copy:

```env
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
```

### 5.2 Add them to `.env.local`

```env
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
```

### 5.3 Mux webhook

Create the webhook endpoint:

```text
https://tangible-impala-375.convex.site/webhooks/mux
```

Enable the normal video asset lifecycle events.

Copy the signing secret:

```env
MUX_WEBHOOK_SECRET=...
```

## 6. Railway Storage Setup

### 6.1 Create a Railway bucket

Collect:

```env
RAILWAY_ACCESS_KEY_ID=...
RAILWAY_SECRET_ACCESS_KEY=...
RAILWAY_ENDPOINT=https://...
```

Also set:

```env
RAILWAY_BUCKET_NAME=...
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true
```

### 6.2 About `RAILWAY_PUBLIC_URL`

For this repo, `RAILWAY_PUBLIC_URL` is optional.

If unset, the code falls back to `RAILWAY_ENDPOINT`.

That was the correct setup during this deployment.

So this is valid:

```env
RAILWAY_PUBLIC_URL=
```

## 7. Resend Setup

Optional, but if you want watch notification emails:

```env
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=Loam <notify@m.loam.video>
```

## 8. `.env.local` Structure

The final root `.env.local` should contain at least:

```env
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=

CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=https://loam.video
APP_SITE_URL=https://loam.video

MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_BASIC_MONTHLY=
STRIPE_PRICE_PRO_MONTHLY=

RAILWAY_ACCESS_KEY_ID=
RAILWAY_SECRET_ACCESS_KEY=
RAILWAY_ENDPOINT=
RAILWAY_PUBLIC_URL=
RAILWAY_BUCKET_NAME=
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true

RESEND_API_KEY=
NOTIFICATION_FROM_EMAIL=

CONVEX_DEPLOY_KEY=
```

## 9. Convex Setup

### 9.1 Important repo state

This repo already uses Convex and already had a dev deployment.

The usual CLI entry points are:

```bash
bunx convex dev
bunx convex deploy
```

### 9.2 Production deployment

Use the existing Convex project and production deployment unless you intentionally want a new one.

### 9.3 Set production env vars on Convex

The required production envs are:

```env
APP_SITE_URL=https://loam.video
VITE_CONVEX_SITE_URL=https://loam.video
CLERK_JWT_ISSUER_DOMAIN=https://clerk.loam.video

STRIPE_SECRET_KEY=...
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
MUX_WEBHOOK_SECRET=...

RAILWAY_ACCESS_KEY_ID=...
RAILWAY_SECRET_ACCESS_KEY=...
RAILWAY_ENDPOINT=...
RAILWAY_BUCKET_NAME=...
RAILWAY_REGION=us-east-1
RAILWAY_PUBLIC_URL_INCLUDE_BUCKET=true

RESEND_API_KEY=...
NOTIFICATION_FROM_EMAIL=Loam <notify@m.loam.video>
```

### 9.4 Convex deploy key

In Convex dashboard:

1. Switch to the production deployment
2. Open `Settings`
3. Open `URL and Deploy Key`
4. Generate a production deploy key

Put it into `.env.local` too:

```env
CONVEX_DEPLOY_KEY=prod:...
```

### 9.5 Important Convex CLI gotcha

If `CONVEX_DEPLOY_KEY` is set in your shell or `.env.local`, Convex CLI will use that deployment and ignore flags like `--prod`.

That means:

- be deliberate about which deployment you are targeting
- do not assume `--prod` overrides a loaded deploy key

## 10. Vercel Setup

### 10.1 Log in

```bash
vercel login
```

### 10.2 Create the project

From the repo root:

```bash
vercel project add loam
vercel link --yes --project loam
```

This creates `.vercel/project.json`.

### 10.3 Required Vercel production env vars

Add:

```text
CONVEX_DEPLOY_KEY
VITE_CLERK_PUBLISHABLE_KEY
VITE_CONVEX_SITE_URL=https://loam.video
CLERK_SECRET_KEY
```

You can add them with:

```bash
vercel env add CONVEX_DEPLOY_KEY production
vercel env add VITE_CLERK_PUBLISHABLE_KEY production
vercel env add VITE_CONVEX_SITE_URL production
vercel env add CLERK_SECRET_KEY production
```

Important:

- do not set `VITE_CONVEX_URL` manually in Vercel
- `build:vercel` injects `VITE_CONVEX_URL` automatically

## 11. Validation Before Deploy

You can run:

```bash
bun run deploy:check -- --target=all
```

Also run:

```bash
bun run typecheck
bun run typecheck:convex
bun run lint
```

## 12. Production Deploy

Trigger the first deploy with:

```bash
vercel --prod
```

This project uses [vercel.json](./vercel.json) and [package.json](./package.json), so Vercel will run:

```bash
bun run build:vercel
```

That command does two things:

1. builds the frontend
2. deploys Convex production as part of the build

## 13. Successful First Deploy Outputs

In this setup, the deploy produced:

- Vercel production URL:
  - `https://loam-p4b2sky6q-nikos-projects-122ad137.vercel.app`
- Convex production URL:
  - `https://tangible-impala-375.convex.cloud`
- Convex site/webhook base:
  - `https://tangible-impala-375.convex.site`

If you recreate the setup, your Vercel preview URL may differ, but the Convex production deployment name may remain the same if you reuse the same Convex project.

## 14. Webhook Endpoints

### Stripe

```text
https://tangible-impala-375.convex.site/stripe/webhook
```

### Mux

```text
https://tangible-impala-375.convex.site/webhooks/mux
```

## 15. Post-Deploy Domain Setup

In Vercel, add the custom domain:

- `loam.video`

Then point your DNS to Vercel according to the Vercel dashboard instructions.

After that, confirm Clerk production domain settings also allow:

- `https://loam.video`

## 16. Post-Deploy Verification Checklist

Test these in order:

1. Open the homepage
2. Sign up
3. Sign in
4. Create a team
5. Open team settings
6. Start Stripe checkout
7. Confirm Stripe redirect returns correctly
8. Upload a video
9. Confirm Railway upload succeeds
10. Confirm Mux processing finishes
11. Confirm playback works
12. Confirm `/share/...` works
13. Confirm `/watch/...` works
14. Confirm Stripe webhook deliveries succeed
15. Confirm Mux webhook deliveries succeed
16. Confirm Convex health endpoint works

Health endpoint:

```text
https://tangible-impala-375.convex.site/health
```

## 17. Important Gotchas

### 17.1 Root `.env.local`, not `env/`

Local dev and CLI usage depend on root `.env.local`.

### 17.2 Stripe IDs

Use `price_...`, not `prod_...`

### 17.3 Railway public URL

Usually leave `RAILWAY_PUBLIC_URL` empty unless you truly have a separate public bucket base URL.

### 17.4 Convex concurrency

Setting several Convex env vars in parallel can cause:

- `OptimisticConcurrencyControlFailure`

If that happens, retry the writes one by one.

### 17.5 Convex deploy key precedence

If `CONVEX_DEPLOY_KEY` is loaded, Convex CLI may target that deployment and effectively ignore `--prod`.

### 17.6 Clerk keys

Production Vercel must use live Clerk keys and the production issuer URL:

- `pk_live_...`
- `sk_live_...`
- `https://clerk.loam.video`

### 17.7 Build warning

The production build currently warns that the `hls` client chunk is over `500 kB`.

This did not block deploy, but it is worth optimizing later.

## 18. Minimal Command Summary

```bash
bun install
bun run typecheck
bun run typecheck:convex
bun run lint
bun run deploy:check -- --target=all

vercel login
vercel project add loam
vercel link --yes --project loam

vercel env add CONVEX_DEPLOY_KEY production
vercel env add VITE_CLERK_PUBLISHABLE_KEY production
vercel env add VITE_CONVEX_SITE_URL production
vercel env add CLERK_SECRET_KEY production

vercel --prod
```
