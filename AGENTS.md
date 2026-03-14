## Agent info

`loam` is an async video sharing app for teams, built around fast playback, private-by-default sharing, comments, and simple link-based workflows.

Generally speaking, you should browse the codebase to figure out what is going on.

We have a few "philosophies" I want to make sure we honor throughout development:

### 1. Performance above all else

When in doubt, do the thing that makes the app feel the fastest to use.

This includes things like

- Optimistic updates
- Using the custom data loader patterns and custom link components with prewarm on hover
- Avoiding waterfalls in anything from js to file fetching

### 2. Good defaults

Users should expect things to behave well by default. Less config is best.

### 3. Convenience

We should not compromise on simplicity and good ux. We want to be pleasant to use with as little friction as possible. This means things like:

- All links are "share" links by default
- Getting from homepage to latest video should always be fewer than 4 clicks
- Minimize blocking states to let users get into app asap

### 4. Security

We want to make things convenient, but we don't want to be insecure. Be thoughtful about how things are implemented. Check team status and user status before committing changes. Be VERY thoughtful about endpoints exposed "publicly". Use auth and auth checks where they make sense to.

## Deployment

Production deploys go through Vercel, and the Vercel build also deploys Convex.

The production flow for this repo is:

- push your changes to `main`
- run `vercel --prod` from the repo root
- Vercel runs `bun run build:vercel`
- `build:vercel` runs `bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL`

That means a production deploy updates both:

- the web app on Vercel
- the backend/functions/schema on Convex

Before a production deploy, run:

- `bun run lint`
- `bun run typecheck`
- `bun run typecheck:convex`

Useful deployment checks:

- `vercel ls loam --yes`
- `vercel inspect loam.video`
- `vercel alias ls`

Important:

- do not set `VITE_CONVEX_URL` manually in Vercel
- `CONVEX_DEPLOY_KEY` must exist in Vercel production env vars
- if `CONVEX_DEPLOY_KEY` is present in your local shell or `.env.local`, Convex CLI may target that deployment when you run Convex commands locally
