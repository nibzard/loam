Production is live, and the Convex-side playback failure is fixed.

What is live:
- `www.loam.video` is currently aliased to `https://loam-p0r5sbisl-nikos-projects-122ad137.vercel.app`.
- During inspection, a newer production deployment (`https://loam-je5k26zqg-nikos-projects-122ad137.vercel.app`) was still building and was not the live alias.

Root cause:
- Production Convex was missing `MUX_SIGNING_KEY` and `MUX_PRIVATE_KEY`.
- The failure reproduced directly in production logs on `videoActions:getPlaybackSession` / `videoActions:getSharePlaybackBootstrap` with `Missing required environment variable: MUX_SIGNING_KEY (or legacy MUX_SIGNING_KEY_ID)`.

Fix applied:
- Set `MUX_SIGNING_KEY` and `MUX_PRIVATE_KEY` on the live Convex production deployment.
- Updated [scripts/check-deploy-env.ts](/Users/nikola/dev/loam/scripts/check-deploy-env.ts) so future preflight checks treat those vars as required instead of optional.

Verification:
- Confirmed both env vars now exist in production Convex.
- Re-ran the unauthenticated production share-playback path with `videoActions:getSharePlaybackBootstrap` against a live share token and got a `state: "ready"` response with signed Mux playback URLs.
- Recent production logs showed the same action succeeding after the env fix.

Remaining note:
- I did not do a signed-in browser smoke test of the dashboard playback route, so the authenticated UI path is still worth checking in-browser once convenient. The backend failure that was breaking signed playback is resolved.
