Shipped the playback hotfix to production.

What I deployed:
- Production branch tip is `6b818d2`, which includes the hotfix commit `3d795b4 fix(playback): create missing signed playback ids`.
- I deployed from a clean worktree linked to the real Vercel project `loam`, not from the dirty local workspace.

Validation before deploy:
- `bun run lint` passed.
- `bun run typecheck` passed.
- `bun run typecheck:convex` passed.

Production result:
- Vercel production deployment: `dpl_FQzxYxfCaQcVhF6WnTHpYWTiKp9d`
- Production URL: `https://loam-admsl1655-nikos-projects-122ad137.vercel.app`
- Alias confirmed on March 11, 2026: `https://www.loam.video`
- Convex deploy completed successfully to `https://tangible-impala-375.convex.cloud`

Live verification:
- `vercel inspect` shows `www.loam.video` aliased to deployment `dpl_FQzxYxfCaQcVhF6WnTHpYWTiKp9d`.
- `curl -I https://www.loam.video` returned `HTTP/2 200`.
- `vercel curl / --deployment https://www.loam.video` returned the live homepage HTML from the newly aliased deployment.

Caveat:
- I verified the new production deployment and live alias on `www.loam.video`, and I verified Convex functions were redeployed.
- I did not have a public share token or authenticated production session available to replay the exact signed-playback failure path externally after deploy, so the final verification is deployment-level rather than a direct end-user share-link playback test.
