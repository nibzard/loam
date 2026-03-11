---
name: deploy-live
description: Deploy `loam` to live production on Vercel and Convex, including preflight checks, production deploy, verification, and rollback-aware follow-up. Use this whenever the user asks to deploy live, ship to production, push a hotfix, run `vercel --prod`, verify a production release, inspect a failed production deploy, or confirm that a fix is actually live on `www.loam.video`.
---

# Deploy Live

Deploy `loam` to production in the repo-approved way:

- Production deploys go through Vercel.
- The Vercel build also deploys Convex.
- A live deploy updates both the web app and backend/functions/schema.

This skill is project-specific. Prefer it over a generic deploy workflow whenever the target is this repo.

## Scope guardrails

Keep deployment work inside the user's actual request.

- Do not commit, push, or change branches unless the user explicitly asked for that.
- Do not edit code, docs, or env configuration during a deploy-only request.
- Do not mutate production config or secrets during an inspection-only request.
- If the user asks to inspect, verify, or debug what is live, start by reproducing and reporting. Patch or redeploy only if the user also asked for that, or if the request clearly continues an in-flight fix that still needs shipping.

The failure mode to avoid is improvising extra work that the user did not request. This skill should make production work safer and more deliberate, not more expansive.

## What to do

### 1. Read the room first

Before deploying, confirm what changed and whether a deploy is actually the right next step.

Check:

- `git status --short`
- whether the user asked for production specifically
- whether there are unrelated dirty files that should not be part of the deploy

Do not reset or discard unrelated changes.

If the user asks to deploy live, default to deploying the current workspace state after preflight checks unless there is a concrete blocker.

If the user asks to inspect what is live or debug production:

- do not assume a deploy is needed yet
- determine whether the task is inspection-only, deploy-only, or debug-then-patch
- say which mode you are operating in through your actions

### 2. Follow the real production path

For this repo, production deploy is:

1. push changes to `main`
2. run `vercel --prod` from the repo root
3. Vercel runs `bun run build:vercel`
4. `build:vercel` runs:

```bash
bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

That means one production deploy updates:

- the Vercel site
- the Convex production deployment

Do not set `VITE_CONVEX_URL` manually in Vercel.

### 3. Run the required preflight checks

Before a production deploy, run exactly these checks from the repo root:

```bash
bun run lint
bun run typecheck
bun run typecheck:convex
```

If any check fails:

- stop the deploy
- show the failure clearly
- fix it only if the user asked you to continue and it is in scope

Recommended additional check when deployment config is in doubt:

```bash
bun run deploy:check -- --target=convex
```

Use it when:

- deployment or env configuration recently changed
- Convex signing/storage/webhook failures are suspected
- a production-only problem needs confirmation before shipping

### 4. Run the deploy

Deploy from the repo root:

```bash
vercel --prod
```

Do not push a commit as part of this skill unless the user explicitly asked you to push or the repo workflow for this task already includes that as a confirmed step.

Treat the deploy as incomplete until the CLI returns:

- the production deployment URL
- the aliased live URL

Useful follow-up commands:

```bash
vercel ls loam --yes
vercel inspect loam.video
vercel alias ls
```

Use them when the alias looks wrong, a deployment is stuck, or the user asks what is currently live.

### 5. Verify the deploy actually shipped

After `vercel --prod`, report:

- the deployment URL
- the aliased live URL
- whether preflight checks passed

Then recommend or perform the smallest relevant smoke test.

For `loam`, the most important smoke tests are:

1. open the production site
2. confirm auth still works
3. confirm the specific user-reported bug is fixed
4. if video behavior changed, test upload/processing/playback/share as relevant

If the deploy was intended to fix a production-only bug, verify the exact failing path instead of stopping at “deploy succeeded”.

### 6. Production debugging rules

When the user says production is still broken after deploy, do not guess. Reproduce and inspect production state directly.

Use:

```bash
bunx convex run --prod <function> '<json args>'
bunx convex data <table> --prod --limit 20 --format jsonl
timeout 5 bunx convex logs --prod --history 200 --jsonl
```

Important nuance:

- if `CONVEX_DEPLOY_KEY` is present locally, the Convex CLI may target production automatically
- the CLI may print that it is ignoring explicit deployment flags and using `CONVEX_DEPLOY_KEY`

Treat that as expected, not as a separate bug.

During diagnosis:

- verify suspected env or secret issues before claiming them as root cause
- prefer direct evidence from production commands, deployment output, stored data, or logs
- report what is proven, what is inferred, and what still needs confirmation

Do not change env vars, update production config, or patch repository files during a debug-only request unless the user explicitly asked you to fix the issue as part of the same task.

For production playback or backend failures:

- prefer reproducing the exact action/query with `bunx convex run --prod`
- inspect the underlying row in Convex data
- compare stored identifiers with external provider state
- only then patch and redeploy

### 7. Lessons learned for this repo

Keep these in mind because they have already mattered in real debugging:

- Signed playback session paths are latency-sensitive. Prefer cached data already stored on the video record over unnecessary provider round-trips.
- A “successful deploy” is not enough if the reported production bug still reproduces. Verify the exact failing route or action after shipping.
- Deployment docs can drift behind implementation. When runtime behavior and docs disagree, trust the live code path and then update the skill or docs.
- For this repo, production deploys are backend deploys too. A web-only mental model is wrong here.

### 8. Rollback posture

If a deploy fails or introduces a regression:

- inspect the failing deployment with `vercel inspect <deployment-url> --logs`
- redeploy a known-good commit if necessary
- do not rotate secrets unless the problem is actually secret-related

If asked for rollback steps, prefer:

1. identify the known-good commit/deployment
2. redeploy that revision through Vercel
3. verify the live alias and the affected workflow

## Output format

When you finish a live deploy, report in this shape:

```text
Production is live.

Deployed URL: <deployment-url>
Alias: <live-url>

Checks run:
- bun run lint
- bun run typecheck
- bun run typecheck:convex

Next verification:
- <smallest relevant smoke test>
```

If deployment is blocked, report:

```text
Production deploy stopped.

Blocker:
- <failed command and reason>

Not deployed:
- Vercel
- Convex

Next step:
- <specific fix or decision needed>
```

## Examples

**Example 1**
Input: "deploy live"
Output: Run preflight checks, run `vercel --prod`, wait for alias confirmation, then report the live URL and the most relevant smoke test.

**Example 2**
Input: "ship this hotfix to prod and make sure playback actually works"
Output: Run checks, deploy, then verify the exact playback path on production instead of stopping at the deploy result.

**Example 3**
Input: "is the new build actually live on loam.video?"
Output: Inspect the latest Vercel production deployment and alias state, then confirm whether `www.loam.video` points at the expected deployment.
