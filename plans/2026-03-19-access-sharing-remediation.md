# Access And Sharing Remediation Plan

## Goals

- Prevent external share viewers from seeing internal-only discussion.
- Make per-video access and external sharing owner-controlled instead of workspace-wide.
- Revoke restricted grants when membership is removed so old access does not silently come back.
- Remove the new ACL N+1 lookups from hot dashboard paths.
- Keep private thumbnail caching fast without pinning stale posters after a video is replaced.

## Scope

This plan addresses the review findings from the `feat(sharing): replace public watch with team access` refactor.

## Workstreams

### 1. Discussion isolation

- Add an audience field to `comments` and `reactions`.
- Write dashboard comments/reactions as `team`.
- Write share-link comments/reactions as `share`.
- Make share-link readers only see `share` discussion.
- Keep dashboard readers able to see both `team` and `share` discussion so external feedback is visible internally.
- Add regression tests for:
  - internal comments not leaking to shared viewers
  - shared comments remaining visible in the dashboard
  - same behavior for reactions

### 2. Share and ACL ownership

- Introduce a backend helper for video management rights.
- Restrict access-setting changes and share-link management to:
  - the uploader
  - optionally team admins/owners as an override path
- Update UI gating so share/access controls only render when the current user can actually manage them.
- Add regression tests for:
  - regular member cannot manage another member's video
  - uploader can manage their own video
  - admin/owner behavior matches the chosen policy

### 3. Grant revocation lifecycle

- Add helpers to delete `videoMemberGrants`:
  - for one video
  - for one user within a team
  - for a whole team
- Run that cleanup on:
  - `teams.removeMember`
  - `teams.leave`
  - `teams.deleteTeam`
- Add regression tests proving re-invited users do not regain old restricted access automatically.

### 4. ACL performance cleanup

- Batch grant reads by team/user instead of querying `videoMemberGrants` per video.
- Reuse a preloaded restricted-access set in:
  - `videos.list`
  - `projects.list`
  - `teams.listWithProjects`
  - `videos.listPlaybackTargetsForProject`
- Keep the single-video helper for point checks such as direct page loads.
- Add focused tests around the new batched helper behavior.

### 5. Poster invalidation

- Change the in-memory poster state in `useProjectVideoPosterUrls` to track the playback id alongside the poster URL.
- Drop fetched poster state when:
  - the video disappears
  - the video is no longer ready
  - the playback id changes
  - a stable fallback thumbnail becomes available
- Add a regression test for same-video-id replacement with a new playback id.

## Execution order

1. Discussion isolation
2. Share/ACL ownership
3. Grant revocation lifecycle
4. ACL performance cleanup
5. Poster invalidation
6. Validation and cleanup

## Validation

- `bun run lint`
- `bun run typecheck`
- `bun run typecheck:convex`
- Targeted tests for comments, reactions, auth, teams, videos, and poster cache/hook logic

## Notes

- This work can break POC compatibility where needed.
- The implementation should prefer explicit helpers over more ad hoc role checks so the access model stays readable.
