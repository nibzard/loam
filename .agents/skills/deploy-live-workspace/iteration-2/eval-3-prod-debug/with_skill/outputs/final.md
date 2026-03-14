Production is live, and the current Vercel alias is pointing at the newest production deploy from March 11, 2026 at 23:22 CET:

- `https://www.loam.video`
- backing deployment: `https://loam-admsl1655-nikos-projects-122ad137.vercel.app`

On the Convex side, the CLI is targeting production deployment `tangible-impala-375` via `CONVEX_DEPLOY_KEY`, and production logs do not show a broad backend outage. Playback-related actions and queries are succeeding in production, including `videos:getVideoForPlayback`, `videoActions:getPlaybackSession`, and `videoActions:getOriginalPlaybackUrl`.

The recurring live Convex failure is narrower and reproducible in logs:

- `videoPresence:heartbeat`
- error: `sessionId ... must be unique for a given room/user`

The relevant code path is [src/lib/useVideoPresence.ts](/Users/nikola/dev/loam/src/lib/useVideoPresence.ts#L47), which generates a client `sessionId` and reuses it for heartbeats, and [convex/videoPresence.ts](/Users/nikola/dev/loam/convex/videoPresence.ts#L44), which forwards that `sessionId` into the Convex presence component. The component itself throws exactly this error when the same `sessionId` is seen for a different `roomId` or `userId`: [public.ts](/Users/nikola/dev/loam/node_modules/@convex-dev/presence/src/component/public.ts#L22).

What is proven:

- production Vercel is serving the newest deploy
- production Convex is healthy enough to serve playback and share traffic
- the live backend error is currently in presence heartbeats, not in playback session generation

What is inferred:

- the visible production break on the Convex side is likely the watcher/presence system on video pages, not the core playback path
- the most likely root cause is client reuse of a `sessionId` across an identity or room transition, causing the presence component to reject subsequent heartbeats

Recommended next step:

1. Patch `useVideoPresence` so a presence session is force-rotated on identity/room changes without allowing stale heartbeats to reuse the prior `sessionId`.
2. Redeploy through Vercel so Convex is updated with the web build.
3. Verify on a production video/share page that presence no longer logs `videoPresence:heartbeat` uniqueness errors.

No repo files, production env, or deployments were changed during this inspection.
