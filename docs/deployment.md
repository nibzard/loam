# Deployment Guide (Step by Step)

This guide deploys `loam` to production using:

1. Vercel for the web app
2. Convex for backend/database/actions
3. Clerk for auth
4. Stripe for billing
5. Mux for video processing/playback
6. Railway S3-compatible storage for original uploads
7. Optional Resend for watch notification emails

## 1. Prerequisites

1. Have access to these accounts: Vercel, Convex, Clerk, Stripe, Mux, Railway.
2. Install Bun and project dependencies:

```bash
bun install
```

3. Run local quality checks before first deploy:

```bash
bun run lint
bun run typecheck
bun test
```

## 2. Choose your production domain

1. Decide the canonical production URL (example: `https://loam.you`).
2. If your domain is not `https://loam.you`, update these files before deploy:
3. `src/lib/seo.ts` default site URL.
4. `public/robots.txt` sitemap URL.
5. `public/sitemap.xml` `<loc>` entries.

## 3. Create and configure Clerk

1. Create a Clerk application.
2. Copy the publishable key and secret key.
3. Copy JWT issuer domain and set Convex auth provider domain from it.
4. Add production allowed origins/redirect URLs in Clerk for your Vercel/custom domain.

## 4. Create and configure Railway object storage

1. Create a Railway storage bucket.
2. Collect these values:
3. `RAILWAY_ACCESS_KEY_ID`
4. `RAILWAY_SECRET_ACCESS_KEY`
5. `RAILWAY_ENDPOINT`
6. `RAILWAY_PUBLIC_URL` (or rely on endpoint as fallback)
7. Optional: `RAILWAY_BUCKET_NAME`, `RAILWAY_REGION`, `RAILWAY_PUBLIC_URL_INCLUDE_BUCKET`

## 5. Create and configure Mux

1. Create Mux access token credentials and collect:
2. `MUX_TOKEN_ID`
3. `MUX_TOKEN_SECRET`
4. Create a webhook endpoint later pointing to:
5. `https://<your-convex-deployment>.convex.site/webhooks/mux`
6. Save the webhook signing secret as:
7. `MUX_WEBHOOK_SECRET`

## 6. Create and configure Stripe

1. Create two recurring prices for plans:
2. Starter -> save as `STRIPE_PRICE_BASIC_MONTHLY`
3. Pro -> save as `STRIPE_PRICE_PRO_MONTHLY`
4. Collect your Stripe secret key as `STRIPE_SECRET_KEY`.
5. Create Stripe webhook endpoint:
6. `https://<your-convex-deployment>.convex.site/stripe/webhook`
7. Subscribe at minimum to:
8. `customer.subscription.created`
9. `customer.subscription.updated`
10. `customer.subscription.deleted`
11. Save webhook signing secret as `STRIPE_WEBHOOK_SECRET`.

## 7. Configure Convex production environment

1. Create a Convex production deployment/project.
2. In Convex environment variables, set:
3. `CLERK_JWT_ISSUER_DOMAIN`
4. `MUX_TOKEN_ID`
5. `MUX_TOKEN_SECRET`
6. `MUX_WEBHOOK_SECRET`
7. `STRIPE_SECRET_KEY`
8. `STRIPE_WEBHOOK_SECRET`
9. `STRIPE_PRICE_BASIC_MONTHLY`
10. `STRIPE_PRICE_PRO_MONTHLY`
11. `RAILWAY_ACCESS_KEY_ID`
12. `RAILWAY_SECRET_ACCESS_KEY`
13. `RAILWAY_ENDPOINT`
14. `RAILWAY_PUBLIC_URL` (recommended)
15. `RAILWAY_BUCKET_NAME` (optional, default `videos`)
16. `RAILWAY_REGION` (optional, default `us-east-1`)
17. `RAILWAY_PUBLIC_URL_INCLUDE_BUCKET` (optional)
18. `APP_SITE_URL` (recommended, example `https://loam.you`)
19. `VITE_CONVEX_SITE_URL` (recommended, same value as `APP_SITE_URL`)
20. Optional email notifications:
21. `RESEND_API_KEY`
22. `NOTIFICATION_FROM_EMAIL`

## 8. Configure Vercel project

1. Import this GitHub repo into Vercel.
2. This repo already sets:
3. Build command in `vercel.json`: `bun run build:vercel`
4. Output directory: `dist/client`
5. Add Vercel environment variables:
6. `CONVEX_DEPLOY_KEY` (from Convex deployment settings, production deploy key)
7. `VITE_CLERK_PUBLISHABLE_KEY`
8. `CLERK_SECRET_KEY`
9. `VITE_CONVEX_SITE_URL` (canonical public URL, example `https://loam.you`)

Note: `build:vercel` runs:

```bash
bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

This injects the correct production `VITE_CONVEX_URL` during build.

## 9. Deploy

1. Push to `main`.
2. Wait for Vercel build to complete.
3. Confirm Convex deploy succeeds as part of Vercel build logs.

## 10. Post-deploy checks

1. Open app home page on production domain.
2. Confirm sign-in and sign-up work with Clerk.
3. Create a team, then open team settings.
4. Start Stripe checkout flow and confirm redirect works.
5. Upload a video and confirm:
6. upload completes
7. Mux processing reaches ready state
8. playback works
9. Create a restricted share link and confirm `/share/...` works.
10. If public visibility is enabled, confirm `/watch/...` works.
11. Confirm webhook health:
12. Stripe webhook deliveries are successful
13. Mux webhook deliveries are successful
14. Optionally check Convex health route:
15. `https://<your-convex-deployment>.convex.site/health`

## 11. Common failure points

1. Missing `CONVEX_DEPLOY_KEY` in Vercel causes build failure.
2. Missing `CLERK_JWT_ISSUER_DOMAIN` in Convex breaks auth in backend functions.
3. Wrong Stripe price IDs causes checkout errors.
4. Missing Railway storage vars causes upload/signing failures.
5. Wrong `APP_SITE_URL` or `VITE_CONVEX_SITE_URL` can break canonical links and billing redirect allowlist checks.

## 12. Rollback

1. Roll back the Vercel deployment from the Vercel dashboard.
2. If needed, redeploy a prior git commit to re-run Convex deploy with known good code.
3. Keep webhook secrets unchanged unless you intentionally rotate them.
