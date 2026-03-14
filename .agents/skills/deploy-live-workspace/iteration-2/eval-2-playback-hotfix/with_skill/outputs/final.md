Production is live.

Deployed URL: https://loam-8196zkfrf-nikos-projects-122ad137.vercel.app
Alias: https://www.loam.video

Checks run:
- bun run lint
- bun run typecheck
- bun run typecheck:convex

Verification:
- Confirmed the deployed production share bootstrap returns `state: "ready"` with a signed playback session on production via `bunx convex run videoActions:getSharePlaybackBootstrap ...`.
- Opened `https://www.loam.video/share/05OdqekS2LX05xJ2p8cikPS7r7i2BRgM` in a real browser session against production.
- Verified the live page rendered player controls, and after clicking play the primary control changed from `Play` to `Pause`, confirming playback started successfully on `www.loam.video`.

Next verification:
- Re-test the originally reported playback/share link that was failing in production to confirm the hotfix covers that exact user path.
