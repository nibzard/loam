Production deploy is live.

I ran the required predeploy checks first:
- `bun run lint`
- `bun run typecheck`
- `bun run typecheck:convex`

All three passed, then I ran `vercel --prod` from `/Users/nikola/dev/loam`.

The production deployment is `Ready` on Vercel:
- Production URL: `https://loam-48uhz2kc4-nikos-projects-122ad137.vercel.app`
- Aliases attached: `https://www.loam.video`, `https://loam.video`

I left the existing unrelated local changes in the worktree untouched.
