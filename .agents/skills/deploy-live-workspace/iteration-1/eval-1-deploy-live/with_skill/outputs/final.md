Production is live.

Deployed URL: https://loam-id0l3ewgz-nikos-projects-122ad137.vercel.app
Alias: https://www.loam.video

Checks run:
- bun run lint
- bun run typecheck
- bun run typecheck:convex

Verification:
- `curl -I -L https://www.loam.video` returned `HTTP/2 200`

Next verification:
- Open `https://www.loam.video` and confirm production auth still works
