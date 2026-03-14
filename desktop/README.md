# Loam Desktop Recorder

This directory contains the current implementation and supporting docs for a minimal native recorder for `loam`.

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
- [macOS Finish Plan](./MACOS-FINISH-PLAN.md)

## Read Order

1. [Architecture](./ARCHITECTURE.md)
2. [Implementation Plan](./IMPLEMENTATION-PLAN.md)
3. [Backlog](./BACKLOG.md)
4. [macOS Finish Plan](./MACOS-FINISH-PLAN.md)

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
- the desktop Convex upload contract is implemented in `../convex/desktopRecorder.ts`
- single-part native upload streaming is implemented with progress events and cancellation
- desktop backend contract tests pass on Linux via `bun test /home/agent/loam/convex/desktopRecorder.test.ts`
- macOS smoke coverage is available via `cargo run --example recording-smoke -- 3` from `src-tauri/` to validate local output and stop metadata
- Convex generated API refresh is still pending a configured deployment before manual `desktopRecorder:*` function references can be removed from the renderer

## Internal macOS Release Notes

### Required environment

Desktop renderer:

- `VITE_CLERK_PUBLISHABLE_KEY`: the same Clerk publishable key the web app uses
- `VITE_CONVEX_URL`: the Convex deployment URL used by `loam`

Convex/backend environment:

- `VITE_CONVEX_SITE_URL` or `APP_SITE_URL`: required if completion payloads should contain absolute `share` and dashboard URLs that can be opened externally from the desktop app

Auth assumptions:

- Clerk runs directly inside the Tauri webview
- Convex auth is derived from the Clerk session in the renderer
- there is no Rust-side auth fallback in the internal release path

### Internal build command

On a macOS machine with Xcode command line tools, Rust, Bun, and the Tauri toolchain installed:

```bash
VITE_CLERK_PUBLISHABLE_KEY=... \
VITE_CONVEX_URL=... \
bun run tauri:build:macos
```

This produces the internal release artifacts as a macOS `.app` and `.dmg`.

### Record-to-share default workflow

1. Sign in with the existing Loam Clerk identity
2. Grant screen and microphone permissions as needed
3. Pick a display or window, optional microphone, and target project
4. Record locally, then stop
5. Desktop prepares the upload in Convex, streams the file natively, and finalizes the video record
6. The share URL is copied by default
7. The browser default opens the share page for `ready`, `processing`, and `uploading` results, and opens the dashboard when the result is `failed`

### Known constraints for internal use

- macOS only; Windows remains deferred
- single-part uploads only, with Loam's existing 5 GiB limit
- the release assumes Clerk works reliably inside the Tauri webview
- share and dashboard browser opens depend on the backend returning absolute URLs
- local fallback video output is still kept on disk after upload

### Deferred before any wider release

- code signing, notarization, and polished bundle assets
- background upload resume after app restart
- multipart uploads for recordings above 5 GiB
- Windows support
- any desktop-specific auth fallback if the Clerk webview path proves unstable

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
