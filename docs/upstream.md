# Upstream Sync

`loam` is a fork of [`pingdotgg/lawn`](https://github.com/pingdotgg/lawn). The fork keeps its own identity and use case, but it can still pull meaningful fixes from upstream when they are worth taking.

## Remotes

This repo uses:

- `origin` for `nibzard/loam`
- `upstream` for `pingdotgg/lawn`

Verify:

```bash
git remote -v
```

## Review Upstream Changes

Fetch the latest upstream branches:

```bash
git fetch upstream
```

See what upstream `main` has that this fork does not:

```bash
git log --oneline main..upstream/main
```

Inspect the diff before taking anything:

```bash
git diff main..upstream/main
```

## Bring Changes In

If an upstream update is broadly compatible with `loam`, merge it:

```bash
git checkout main
git merge upstream/main
```

If you only want a focused fix, prefer cherry-picking:

```bash
git cherry-pick <commit>
```

## Practical Guidance

- Prefer upstream security, stability, infra, and performance fixes.
- Review product and marketing changes carefully before merging.
- Expect more conflicts as `loam` diverges from `lawn`.
- Keep upstream attribution and the original MIT license notice intact.

## Recommended Workflow

1. `git fetch upstream`
2. Review `git log --oneline main..upstream/main`
3. Decide whether to merge all of `upstream/main` or cherry-pick specific commits
4. Run `bun run build`, `bun run typecheck`, and `bun run lint`
5. Resolve any conflicts in branding, routes, pricing copy, and product behavior before pushing
