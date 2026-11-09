# Upstream Alignment Plan: lawn → loam

Date: 2026-11-09
Status: Proposed
Sources: 145-commit upstream survey (`pingdotgg/lawn`, merge-base `046c2b2`, 2026-02-27), 11-agent workflow, 2026-11-09. Full findings in the session transcript; commit SHAs cited inline.

## Context: two products, two audiences

`lawn` (upstream) and `loam` (this fork) share an ancestor, not a mission. Every verdict below follows from this split.

| | lawn (upstream) | loam (us) |
| --- | --- | --- |
| Audience | Creative teams and creators sharing review links | Internal teams doing async screen-video workflows |
| Default exposure | Public watch pages, downloads, version browsing for public viewers | Private by default. No public watch. Restricted share grants only |
| Playback | Unsigned `stream.mux.com` URLs, public playback IDs | Signed playback sessions with expiry and refresh |
| Access model | Team roles, public links | ACL: `accessMode`, per-video `videoMemberGrants`, owner-controlled sharing, grant revocation on membership removal |
| Cost control | Plan-gated upload size (up to 75 GiB) | Account-level watch-minute caps, storage caps |
| Pricing | lawn plans | Flat $15 Starter / $49 Pro, unlimited seats, viewer-first invites |
| Capture | Browser upload | Desktop recorder (Tauri macOS) + browser upload |

Consequence: upstream is a **component library and idea source**, not a merge target. We take security fixes outright, port features that fit team workflows, adapt techniques, and decline everything built on public exposure.

The 2026-11-09 survey confirms a full merge is not viable: 88 conflicts (conflict entries from `git merge-tree --messages HEAD upstream/main`), three architectural deadlocks (their public playback vs our signed sessions; their hardened public watch vs its removal here; version-stack rows vs our per-video grants), plus silent runtime breakage (their `-project.data.ts` merges clean but calls `videos.list` with arguments our backend rejects).

## Decision rules

- **ADOPT** — take nearly verbatim (cherry-pick or re-apply). Security, crash fixes, isolated utilities.
- **PORT** — rebuild on our model. The idea is right for our audience; the implementation assumes theirs.
- **DECIDE** — needs a product call from Theo before any work. Listed with a default recommendation.
- **SKIP** — built for the public-exposure model or their branding. Record why so we stop re-litigating.

Guard for every PORT: new playback paths must sit behind signed sessions and watch-minute metering. New discussion surfaces must respect the `audience` split. New mutations must keep our grant checks.

## Scoreboard

| Upstream change | Verdict | Priority |
| --- | --- | --- |
| TanStack Start CVE-2026-102989 bump | ADOPT | P0, before the next deploy |
| Bun runtime bump | ADOPT (go to 1.4.4+, past upstream's 1.4.0) | P0 |
| Presence crash fix on deleted/moved videos | ADOPT | P0 |
| Convex package bumps (`6799ad7`: convex, presence, stripe) | ADOPT (align declared pins with our locked runtime) | P1 |
| Team invitation error surfacing | PORT (UI half only; backend already done) | P1 |
| Player one-line layout fix (`cc879fd`) | ADOPT with any player work | P1 |
| Editor shuttle + theater + Final Cut shortcuts | PORT | P1 — already on `todo.md` |
| Comment CSV export, URL autolinking | PORT (audience-aware) | P1 |
| Upload error messages via `ConvexError`, m4v | PORT (map to our coded errors) | P1 |
| Mux status reconciliation, stale-upload sweep | PORT onto `uploadSessions` + signed layer | P2 |
| Auth-chain flattening, bounded reads, pagination | PORT the technique | P2 |
| PR #67 frontend perf (`4c6ed8d`, `8f98027`) | PORT selectively; SKIP route restructuring (`2bffb78`) | P2 |
| Collapsible discussion sidebar | PORT | P2 |
| Frozen-playback 720p recovery, default 720p | default 720p PORTED (`dashboardPlaybackSource.ts`); recovery (`bf041bd`) deferred | P1 done 2026-11-09 |
| Dashboard sorting + expandable titles | PORT | P3 |
| Bulk multi-select (move/status/delete) | PORT after sorting | P3 |
| Video version stacks | PORT as a designed project | P3, highest product value |
| Multi-select `updateWorkflowStatusMany` | SKIP the workflow-status half (field still in schema; see Workstream 4) | — |
| Nested folders | DECIDE (default: defer) | — |
| Cmd+K palette + full-text search | DECIDE (default: later, after stacks) | — |
| S3 multipart uploads, 75 GiB | DECIDE (default: keep 5 GiB until desktop goes wider) | — |
| Team switcher dropdown | PORT (with held-team guard `6421066`) | P3 |
| Storage-bar warning colors (`b21d25a`) | PORT the warning-state treatment; skip their plan copy | P3 |
| Self-serve plan upgrades + Stripe reconciliation | DECIDE (default: adopt upgrades, skip auto-reconcile) | — |
| Public watch enhancements, public downloads | SKIP | — |
| `ensurePublicPlaybackId` / `createPublicPlaybackId` unsigned playback | SKIP — both functions, not just the first | — |
| Share-link reliability (`c6ddc8c`, `16039fd`), share-dialog de-clutter (`e2c5071`) | SKIP as-is: our rewrite replaced their dialog; verify our guards (see Skipped) | — |
| Dashboard header/chrome polish (PR #85, `68ee354`, `17aea1f`, `e8a9dfe`) | SKIP: their dashboard components, ours rewritten | — |
| Homepage/marketing polish, Geist fonts | SKIP | — |
| Prettier repo-wide reformat | SKIP (revisit only if porting volume grows) | — |
| Upstream dev tooling (Conductor, `dev.sh`, `convex-local-setup.sh`, Convex AI files) | SKIP: files absent here; ignore in monthly triage | — |
| Vitest + Playwright harness | PORT selectively | P2 |

## Workstream 0: security and stability (now)

1. Bump TanStack Start and Router: pin `@tanstack/react-start` to exactly `1.168.60` (upstream's proven version) and `@tanstack/react-router` to exactly `1.170.41` (matching react-start's own dependency pin — a caret here resolves a newer router that nests a second `router-core` copy into the client bundle); regenerate `app/routeTree.gen.ts`. We are exposed to CVE-2026-102989 **app-wide, not just on public routes**: an unauthenticated reflected XSS in the TanStack Start server-function transport (`/_serverFn/*`) of `@tanstack/start-server-core` (fixed 1.169.39) and `@tanstack/react-start` (fixed 1.168.60); see GHSA-qx66-fv34-fjm8, CVSS 9.3. A crafted link against any route, including signed-in dashboard routes, runs attacker JavaScript with the victim's authority. Land this **before anything else that ships**: Vercel already refuses builds that resolve `react-start` 1.160.2 (per upstream `c4a1e13`), and our `bun.lock` resolves exactly that, so the next deploy preflight fails until this lands. If the bump slips past a day, add the advisory's interim WAF rule (block browser document navigations to `/_serverFn/*`). Reference commits: `c4a1e13`, `f800ec6`. Status: done 2026-11-09, with the dead `@tanstack/react-router-devtools` dependency removed.
2. Delete the dead unsigned-URL helpers `buildMuxPlaybackHlsUrl` and `prefetchMuxPlaybackManifest` from `src/lib/muxPlayback.ts`, and the dead `buildPublicPlaybackSession` from `convex/playbackSessions.ts` (no production caller; the live path creates signed playback ids and deletes stale public ones). Make the `token` parameter required on `buildMuxPlaybackUrl` and `buildMuxThumbnailUrl` so the server cannot construct an unsigned URL at all — the guarantee becomes compile-time. Client `src/` never constructs `stream.mux.com` URLs; the only permitted references are the `seo.ts` preconnect hints (signed playback uses the same host, token in the query) and test fixtures. Status: done 2026-11-09.
3. Bump `packageManager` past upstream: pin Bun 1.4.4 or newer, not their 1.4.0. Bun sits on the deploy path (`bunx convex dev` ships to prod). Post-1.4.0 advisories (eMudhra root CA, Brotli) are fixed only in 1.4.4.
4. Align Convex dependency pins (from `6799ad7`): our lockfile already resolves convex 1.43.0 while `package.json` declares `^1.32.0`; set the declared range to match the runtime, take `@convex-dev/presence` `^0.3.1` and `@convex-dev/stripe` `^0.1.4`, regenerate `convex/_generated`, and run the full validation set.
5. Presence hardening `8d641f9` — **resolved 2026-11-09: not needed.** Our `listProjectOnlineCounts` (convex/videoPresence.ts) takes only `projectId` and derives videos server-side from the `by_project` index; the client-supplied-`videoIds` design that crashed upstream never existed here, and our client heartbeat calls already catch errors. Added a comment on the query documenting the invariant: client-supplied video IDs must not be added back.
6. Hand-port invitation error surfacing `bc9d205` — a cherry-pick does not apply. Our `inviteMember` already throws coded ConvexErrors (`{code, message}`); only the UI half is missing. In `MemberInvite.tsx`, display `error.data?.message` when `error.data` is an object with a message, and fall back to `error.data` when it is a string. Keep our coded errors; do not adopt upstream's string form.

Validate: `bun run lint`, `bun run typecheck`, `bun run typecheck:convex`, `bun test`. Deploy behind the usual preflight. Note: deploys ship the working tree straight to production.

## Workstream 1: editor parity (this month)

Upstream shipped two items from our own `todo.md`: Final Cut keybindings and theater mode (`7d066eb`, `da3d9cd`, `184c352`).

- Port `src/components/video-player/shuttle.ts` as-is; it is framework-free and has no backend coupling.
- Rebuild the theater-mode layout wrapper on our routes. Keep our player chrome.
- Port the Final Cut chord semantics (hold K + tap J/L, Alt for slow motion, `event.code` for non-US layouts) with their tests.
- Fold in `cc879fd` (`h-full` → `flex-1 min-h-0`) so banners never clip controls.
- Default-720p changeover (`2adfab9`): ported as `src/lib/dashboardPlaybackSource.ts` with tests. Our fork had defaulted to the original-source presign (a 600 s signed GET of the full-resolution MP4); the route now defaults to the Mux 720p session and waits out in-flight session requests instead of starting the original and swapping. The original presign stays as an explicit quality choice.
- Frozen-playback fallback (`bf041bd`): deferred. Its detector targets upstream's unsigned original-playback recovery; under signed forced-720p manifests the failure mode it guards is different. Revisit only if original-source stalls are reported in production.
- Watch-minute billing hardening (fork-specific, added during port review): shuttle rates up to 32x previously metered content time against the team watch caps, so a 60-minute skim could bill 60 team minutes and trip the workspace-wide playback lock. `trackTime` now scales deltas by `max(1, |rate|)`, billing wall-clock time.

This workstream touches `VideoPlayer.tsx`, which both sides rewrote. Expect hand-merging, not cherry-picks.

## Workstream 2: discussion and upload UX (this month)

- Comment CSV export (`e6daea7`): port `commentCsv.ts` (keeps its formula-injection guard) but filter by `audience`. Team export gets `team` + `share`; a share-link export, if we ever offer one, gets `share` only.
- URL autolinking (`980d4b1`, `4e87d99`): port the linear-time parser and scheme allowlist into `CommentText`. Applies to both audiences' surfaces.
- Upload errors (`d7da6f4`): upstream flattens errors to string `ConvexError`s. We use coded errors (`FORBIDDEN` and friends). Do the opposite of their diff: keep codes, add their user-facing message strings, and map in the upload UI. Accept `video/x-m4v` at our initiate and complete checks.
- Collapsible sidebar (`a3ccb86`, `251e899`, `0eb7594`): port behind a design check. It must not hide the audience switcher our share view depends on.

## Workstream 3: reliability and performance (next month)

- Mux status reconciliation (`3c19349`): port the per-minute sweep and "Retry processing" so stuck videos recover. Their sweep calls `getMuxClient`, which we deleted. Re-point it at our `muxRequest` signed layer. Keep their `cronLocks` table idea for sweep serialization. **Trap:** the sweep's `reconcileMuxAssetStatus` also calls `createPublicPlaybackId` when a ready asset lacks a public playback id. Our assets are signed-only (`playback_policies: ["signed"]`), so every reconciled video would take that branch and mint an unsigned public id. Replace that branch with our signed playback-id path, or delete it. Never port `createPublicPlaybackId`.
- Stale-upload reclamation (`760626b`): adapt the 24 h heartbeat pattern (`uploadUpdatedAt`) to our `uploadSessions` state machine. Our `markAsProcessing` outcomes (stale, retry_required, missing_object) already cover the hard cases; add the sweeper.
- Auth-chain flattening (`62c0463`): the technique (one `teamMembers` lookup instead of chained `require*` calls) is sound. Re-apply inside our `requireVideoMemberAccess` and `requireVideoManagementAccess` so grants stay checked. The same commit's `.take(101)` count caps come with it.
- Bounded reads: cap `take` counts and paginate project views as `62c0463` (caps) and `aaf96d8`/`0c2a980` (pagination) do, but through our granted-video-id sets.
- PR #67 leftovers, selectively: take the recovery-flow hardening (`4c6ed8d`, touches `muxPlayback.ts`) with the Mux work, and the prewarmed-rendering guard (`8f98027`). Skip the route/waterfall restructuring (`2bffb78`); it rewrites routes we rewrote.
- Adopt Vitest for unit tests and Playwright for player e2e (upstream's harness, our cases). Our remediation regression tests move to Vitest as they are touched.

## Workstream 4: designed ports (this quarter)

### Version stacks — the flagship

Review iterations are our core loop, and version stacks serve it. But upstream's model (every version is a new `videos` row) collides with three of our systems. Port as a design project:

- Grants: `videoMemberGrants` are keyed by `videoId`. Decide: grants attach to the stack (inherit down `supersededByVideoId`), or copy on `createVersion`. Default: inherit along the chain.
- Watch minutes need no new metering: caps are team-level per billing month (`teamWatchUsage`), and `pricing-strategy.md` forbids per-video or per-stack caps. Ten versions drain the same account pool faster; they cannot multiply it. The one stacks-specific check: switching versions mid-session must not double-count a single viewing session.
- Discussion: `comments` and `reactions` are keyed by `videoId`, and upstream does not move them on `createVersion` — upstream discussion stays per-version. Decide: threads stay per-version, or follow the stack like grants. If they follow, define how `audience` (team vs share, per `discussionAudience.ts`) applies to inherited threads. This decision is as consequential as the grants one; it is our differentiator.
- Deletion: unify their batched `deleteVideoAndDependents` with our cascade (reactions, watch events, grants, scheduled asset cleanup). One delete path, both dependency sets.
- Keep their chain-validation invariants and the 100-version cap.

### Bulk operations

Port multi-select with shift-range and the floating bar (`69b3cec`, `da236dc`, `dcc64b8`). Keep their caps (1,000 versions, sequential chunks). We removed workflow-status *editing*; the `workflowStatus` field still exists in the schema and defaults to `review` on create, so the bulk port must decide: drop the field, or wire it to the new multi-select UI. Re-check every item through our `requireVideoAccess` with grant sets, their per-item rollback pattern.

### Dashboard sorting

Port expandable titles and sort persistence (`aaf96d8` → simplified in `0c2a980`). Skip their first-pass `sortTitle` model; the simplified title-based indexes are the ones to take. Thread through our ACL-filtered `videos.list`.

### Storage bar

Port the warning-state treatment from `b21d25a` onto our storage-cap display: color shifts as a team approaches its storage limit. Skip their Pro-plan copy; our plan names and limits differ.

### Team switcher

Port the dropdown shell (`473d533`, `9a13151`, plus the held-team-context guard `6421066` — without it, uploads and redirects attribute to the switched-away team). The commits themselves carry no palette coupling; only avoid the palette code in `DashboardHeader` when wiring into our header. Our invite growth loop (viewer-first) makes team switching more common for owners than upstream's flow.

## Open decisions for Theo

1. **Max upload size.** Upstream sells 75 GiB. Today no upload path has resume: the desktop uploader is one streamed PUT (cancel-only), the browser uploader is one XHR PUT, and a failed 5 GiB PUT restarts from byte zero — tens of minutes on a typical office uplink, on our flagship capture path. The recorder UI already dead-ends above 5 GiB, and `desktop/README.md` queues multipart uploads as pre-wider-release work. Default: keep 5 GiB until the desktop recorder moves past internal use; the trigger is wider release, not only a customer ask. If raised: multipart requires a compatibility spike on the live Tigris endpoint (`t3.storage.dev`, bucket `loam-videos-f8314047` — the old `t3.storageapi.dev` endpoint is retired) covering ListParts and presigned part PUTs before any port.
2. **Nested folders.** Value depends on how customers organize. Blocks on a folder-level access decision (do grants inherit down folders?). Default: defer until stacks land.
3. **Command palette + search.** High polish, invasive cost: every mutation must route through their `convex/functions.ts` trigger wrapper or the index silently misses writes. Default: after stacks and bulk, not before.
4. **Self-serve upgrades.** Their upgrade flow fits our flat pricing. Their `reconcileTeamSubscription` must not ship as-is: it force-syncs Stripe on every settings visit and would overwrite manually set `billingStatus` (test team `nikos`). Default: adopt upgrades, gate reconciliation behind a manual admin action.
5. **Version browsing for share-link viewers.** Their public version switcher maps to a legitimate loam question: should a restricted grant see new versions? Default: yes, scoped to the grant's stack — this is the review use case.

## Skipped, with reasons

- Public watch stack (version browsing, processing state, downloads for anonymous viewers): contradicts private-by-default. Revisit only if positioning changes.
- `ensurePublicPlaybackId` and `createPublicPlaybackId`, unsigned Mux URLs: undoes the signed-session remediation. Guard both names, not just the first.
- Share-link reliability (`c6ddc8c`, `16039fd`) and share-dialog de-clutter (`e2c5071`): our `769b665` rewrite replaced their ShareDialog and already ships `copyTextToClipboard`. One follow-up before recording the skip: verify our share route guards unavailable share data the way `16039fd` does.
- Dashboard header/chrome polish (PR #85 `f19e41b`/`4cf7114`/`3897e8a`, plus `68ee354`, `17aea1f`, `e8a9dfe`): their dashboard components, ours rewritten. Their storage-bar warning-color treatment (`b21d25a`) is the one piece worth taking — see Workstream 4.
- Upstream dev tooling (Conductor config, `dev.sh`, `convex-local-setup.sh` hardening, Convex AI guideline files): the files do not exist in this repo; ignore in monthly triage.
- Upstream billing constants and gating: our pricing and watch-minute model differ by design.
- Homepage and marketing polish, Geist font weights: their brand surface, not ours.
- Prettier repo-wide reformat: one giant conflict-generating commit against our rewritten UI. Revisit if we start porting whole subsystems.
- Their `sortTitle`/`dashboardSort` data model: replaced upstream itself the same day (`aaf96d8` 15:57, `0c2a980` 16:42).

## Merge policy going forward

`docs/upstream.md` says "merge when broadly compatible". The 2026-11-09 survey supersedes that. Update it to say:

1. Stay diverged. Never merge `upstream/main` wholesale. The conflict count (88 today, by `git merge-tree`) only grows.
2. `git fetch upstream` monthly; triage `git log --oneline main..upstream/main` against this plan's scoreboard.
3. Cherry-pick with `-x` to preserve upstream attribution; record the upstream SHA in the commit body. MIT notice stays.
4. Guard the known traps: files that merge clean but break at runtime (`-project.data.ts` argument shapes), mutations bypassing our grant checks, any code calling `getMuxClient`, `ensurePublicPlaybackId`, or `createPublicPlaybackId`.
5. Skip `convex/_generated` churn in review; regenerate locally.
6. `.claude/skills` is a symlink here and a directory upstream — a file/directory conflict. Exclude it from any upstream operation.

## Validation

Every workstream ships with: `bun run lint`, `bun run typecheck`, `bun run typecheck:convex`, targeted tests, and for playback paths both checks: a signed-session assertion at runtime (no unsigned Mux URLs) and the static guarantee — client code never constructs a `stream.mux.com` URL (allowed references: `seo.ts` preconnect hints and test fixtures), and server builders require a token at compile time. Workstream 4 items add regression tests mirroring the remediation plan's pattern (grants, revocation, audience isolation).

## Sequence

1. Workstream 0 (security) — days; item 1 lands before any other ship.
2. Workstream 1 (editor) — the highest-visibility gap; two `todo.md` items close.
3. Workstream 2 (discussion and upload UX).
4. Workstream 3 (reliability, performance, test harness).
5. Workstream 4 (version stacks, then sorting, then bulk, then team switcher and storage bar) — design review before code on stacks.
