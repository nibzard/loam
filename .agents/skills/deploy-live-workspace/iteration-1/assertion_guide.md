# Assertion guide

## Eval 1 deploy-live
- Pass if output explicitly includes all three preflight commands.
- Pass if output explicitly includes `vercel --prod`.
- Pass if output explicitly says to report both deployment URL and alias/live URL.

## Eval 2 playback-hotfix
- Pass if output includes the required preflight checks.
- Pass if output includes `vercel --prod`.
- Pass if output explicitly says to verify the exact playback path or reported bug after deploy, not just deployment success.

## Eval 3 prod-debug
- Pass if output includes production Vercel inspection or alias inspection.
- Pass if output includes Convex production debugging commands (`convex run`, `convex data`, or `convex logs`).
- Pass if output frames debugging as reproducing the production issue directly rather than generic debugging advice.
