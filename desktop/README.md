# Loam Desktop Recorder

This directory contains the planning docs for a minimal native recorder for `loam`.

The intent is not to fork Cap Desktop as a product. The intent is to study Cap's native recording architecture, lift the right ideas and lower-level seams, and build a much smaller recorder that uses `loam` as the backend for auth, uploads, projects, and share links.

## Product Direction

- macOS first
- Tauri + React renderer, not Solid
- Clerk + Convex stay in the renderer/webview layer
- Rust owns permissions, device enumeration, recording, local file output, and upload streaming
- `loam` stays the source of truth for teams, projects, videos, upload authorization, playback status, and share links
- no editor in v1
- no screenshot product in v1
- no camera overlay in v1
- share links are the default output

## Docs

- [Architecture](./ARCHITECTURE.md)
- [Implementation Plan](./IMPLEMENTATION-PLAN.md)
- [Backlog](./BACKLOG.md)

## Read Order

1. [Architecture](./ARCHITECTURE.md)
2. [Implementation Plan](./IMPLEMENTATION-PLAN.md)
3. [Backlog](./BACKLOG.md)

## Core References In Cap

Start here:

- [Cap recording CLI example](../../Cap/crates/recording/examples/recording-cli.rs)
- [Cap recording crate root](../../Cap/crates/recording/src/lib.rs)
- [Cap instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [Cap permissions commands](../../Cap/apps/desktop/src-tauri/src/permissions.rs)
- [Cap recording orchestration](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [Cap target picker UI](../../Cap/apps/desktop/src/routes/target-select-overlay.tsx)
- [Cap upload pipeline](../../Cap/apps/desktop/src-tauri/src/upload.rs)

Current native status:

- recording lifecycle commands are implemented
- single-part native upload streaming is implemented with progress events and cancellation
- macOS smoke coverage is available via `cargo run --example recording-smoke -- 3` from `src-tauri/` to validate local output and stop metadata

Do not start here:

- [Cap desktop auth flow](../../Cap/apps/desktop/src/utils/auth.ts)
- [Cap desktop auth store](../../Cap/apps/desktop/src-tauri/src/auth.rs)
- [Cap desktop web API wrapper](../../Cap/apps/desktop/src-tauri/src/web_api.rs)
- [Cap editor UI](../../Cap/apps/desktop/src/routes/editor/index.tsx)
- [Cap screenshot editor UI](../../Cap/apps/desktop/src/routes/screenshot-editor/index.tsx)
- [Cap giant Tauri boot file](../../Cap/apps/desktop/src-tauri/src/lib.rs)

## Loam Backend References

- [Project upload targets](../convex/projects.ts)
- [Video creation and state](../convex/videos.ts)
- [Upload and Mux ingest actions](../convex/videoActions.ts)
- [Share links](../convex/shareLinks.ts)
- [Workspace canonical path resolution](../convex/workspace.ts)
- [Dashboard upload manager](../app/routes/dashboard/-useVideoUploadManager.ts)

## Working Rule

If a choice increases native scope but does not materially improve record-to-share speed in v1, defer it.
