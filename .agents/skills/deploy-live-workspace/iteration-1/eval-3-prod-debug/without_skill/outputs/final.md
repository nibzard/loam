Production is live, but the breakage is not a failing Convex deploy. The current public bundle at `https://www.loam.video` is baking in `https://tangible-impala-375.convex.site` for canonical/OG/app URLs, while the actual Convex client URL is correctly `https://tangible-impala-375.convex.cloud` and `https://tangible-impala-375.convex.site/health` returns `OK`.

Root cause: the Vercel build runs `bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL`. In that flow, Convex injects both `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` into the build. This app was using `VITE_CONVEX_SITE_URL` as the public website URL for SEO, so Convex’s injected `*.convex.site` value overwrote the intended `https://loam.video` value during production builds.

I patched the app to stop using the collision-prone env name:

- frontend SEO now reads `VITE_APP_SITE_URL` instead of `VITE_CONVEX_SITE_URL`
- backend absolute-link/redirect logic now prefers `APP_SITE_URL`, with `VITE_APP_SITE_URL` as an optional fallback
- deploy checks and env examples/docs now point Vercel to `VITE_APP_SITE_URL`

Validation:

- `bun run typecheck` passed
- a production-style local build with `VITE_APP_SITE_URL=https://loam.video` generated correct output:
  - canonical: `https://loam.video/`
  - OG image: `https://loam.video/og/home.png`
  - no `tangible-impala-375.convex.site` string in the built client SEO path

What to do next:

1. Add `VITE_APP_SITE_URL=https://loam.video` to Vercel production env.
2. Redeploy production so the new frontend env name is used.
3. Optionally remove the old Vercel `VITE_CONVEX_SITE_URL` entry to avoid future confusion.

Files changed:

- `/Users/nikola/dev/loam/src/lib/seo.ts`
- `/Users/nikola/dev/loam/convex/watchEventActions.ts`
- `/Users/nikola/dev/loam/convex/billing.ts`
- `/Users/nikola/dev/loam/scripts/check-deploy-env.ts`
- `/Users/nikola/dev/loam/env/vercel.production.env.example`
- `/Users/nikola/dev/loam/env/convex.production.env.example`
- `/Users/nikola/dev/loam/docs/setup.md`
- `/Users/nikola/dev/loam/docs/deployment.md`
