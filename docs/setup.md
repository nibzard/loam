# Setup

## Development

Install dependencies:

```bash
bun install
```

Run app + Convex locally:

```bash
bun run dev
```

Run only the web app:

```bash
bun run dev:web
```

## Build / Run

```bash
bun run build
bun run start
```

## Quality checks

```bash
bun run typecheck
bun run typecheck:convex
bun run lint
```

## Deployment helpers

- Production env templates:
  - `env/convex.production.env.example`
  - `env/vercel.production.env.example`
- Readiness check:

```bash
bun run deploy:check -- --target=all
```

## Environment variables

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `RAILWAY_ACCESS_KEY_ID`
- `RAILWAY_SECRET_ACCESS_KEY`
- `RAILWAY_ENDPOINT`
- Optional Railway storage vars:
  - `RAILWAY_PUBLIC_URL`
  - `RAILWAY_BUCKET_NAME`
  - `RAILWAY_REGION`
  - `RAILWAY_PUBLIC_URL_INCLUDE_BUCKET`
- `APP_SITE_URL` for backend redirect allowlists and absolute links
- Optional watch notification email vars:
  - `RESEND_API_KEY`
  - `NOTIFICATION_FROM_EMAIL`
- Convex deployment vars as needed (`CONVEX_DEPLOYMENT`, etc.)

Stripe webhook endpoint (for the Convex Stripe component):

- `https://<your-deployment>.convex.site/stripe/webhook`
