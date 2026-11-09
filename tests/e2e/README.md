# End-to-end tests

Playwright specs for the player and app shell. The specs drive a running loam
environment in a real Chromium browser.

## What the specs cover

`player-smoke.spec.ts` checks three things:

1. The homepage loads and shows the loam brand headline.
1. The sign-in page renders the auth form.
1. A dashboard video page redirects unauthenticated visitors to
   `/sign-in` with a `redirect_url` that points back at the video.

The specs never sign in, so you do not need a test account.

## Requirements

- A running loam environment. `bun run dev` starts the web server on
  `http://localhost:5296` and `bunx convex dev` for the backend. The
  environment needs working Clerk and Convex credentials.
- The Chromium browser for Playwright:

  ```sh
  bunx playwright install chromium
  ```

The Playwright config sets no `webServer`, so it never starts a server for
you. Point the suite at any environment with `E2E_BASE_URL` (default
`http://localhost:5296`):

```sh
E2E_BASE_URL=http://localhost:5296 bun run test:e2e
```

## Skipping without an environment

Each spec first probes the base URL. When no server answers, the spec skips
with a reason instead of failing:

```sh
bun run test:e2e
# 3 skipped
```

This keeps `test:e2e` safe to run on machines without Convex credentials,
such as CI runners or review checkouts.

## Notes

- Unit tests stay on `bun test` (`*.test.ts` under `app/`, `src/`, and
  `convex/`). Playwright owns `tests/e2e/*.spec.ts` only.
- Upstream lawn runs the same browser harness against a standalone Vite
  fixture with no credentials. Loam drives the real app instead, so an
  environment is required and the specs skip when one is absent.
