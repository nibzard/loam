# Loam Desktop Recorder Backlog

This is the historical file-by-file implementation backlog for the first version of the desktop recorder.

Status note as of 2026-03-14:

- the core desktop implementation now exists at the repository root, not under a nested `desktop/` directory
- most build work below has already landed
- use [to-do.json](./to-do.json) for the current task state
- use [MACOS-FINISH-PLAN.md](./MACOS-FINISH-PLAN.md) for the remaining macOS-specific finish work

## Backend Work

### `../convex/desktopRecorder.ts`

- [ ] Create a desktop-focused Convex module.
- [ ] Add `listUploadTargets` wrapper around [projects.listUploadTargets](../convex/projects.ts).
- [ ] Add `prepareUpload` action that wraps:
  - [videos.create](../convex/videos.ts)
  - [videoActions.getUploadUrl](../convex/videoActions.ts)
- [ ] Add `completeUpload` action that wraps:
  - [videoActions.markUploadComplete](../convex/videoActions.ts)
  - [shareLinks.create](../convex/shareLinks.ts)
  - [workspace.resolveContext](../convex/workspace.ts)
- [ ] Add `failUpload` action that wraps [videoActions.markUploadFailed](../convex/videoActions.ts).
- [ ] Return a canonical `shareUrl` and `dashboardUrl`.

### `../convex/videoActions.ts`

- [ ] Decide whether any shared helper extraction is needed for `desktopRecorder.completeUpload`.
- [ ] Keep single-part upload limit behavior explicit for desktop.
- [ ] Avoid mixing desktop-specific concerns into the existing public upload flow unless the abstraction is clearly better.

### `../convex/shareLinks.ts`

- [ ] Confirm `shareLinks.create` semantics are sufficient for desktop default behavior.
- [ ] Decide whether desktop should always create a fresh link or reuse an existing active link.

### `../convex/workspace.ts`

- [ ] Reuse canonical path generation for desktop completion payloads.
- [ ] Avoid duplicating dashboard path-building logic in the desktop renderer.

## Desktop Renderer Scaffold

### `desktop/package.json`

- [ ] Create a desktop package with Tauri, React, Clerk, Convex, and the repo's existing frontend tooling choices where possible.

### `desktop/tsconfig.json`

- [ ] Configure path aliases and strict TS settings consistent with the main app.

### `desktop/vite.config.ts`

- [ ] Configure React + Tauri renderer build.

### `desktop/src/main.tsx`

- [ ] Mount the app and providers.

### `desktop/src/App.tsx`

- [ ] Define the top-level desktop shell.
- [ ] Route between login, setup, recording, uploading, and complete screens.

### `desktop/src/lib/clerk.tsx`

- [ ] Reuse the same publishable-key flow as [../src/lib/clerk.tsx](../src/lib/clerk.tsx).
- [ ] Verify Clerk works inside Tauri webview.

### `desktop/src/lib/convex.tsx`

- [ ] Create desktop-specific Convex provider wiring.
- [ ] Keep auth integrated with Clerk.

### `desktop/src/lib/routes.ts`

- [ ] Centralize desktop route definitions.
- [ ] Keep route transitions simple and local.

## Desktop Renderer State

### `desktop/src/state/app-state.ts`

- [ ] Model top-level app states:
  - booting
  - authRequired
  - permissionsRequired
  - ready
  - recording
  - paused
  - uploading
  - complete
  - error

### `desktop/src/state/recorder-state.ts`

- [ ] Store selected project, target, mic, countdown, upload result, and current recording status.

### `desktop/src/state/settings-state.ts`

- [ ] Persist only high-value defaults:
  - last project
  - last microphone
  - capture system audio
  - countdown seconds
  - open browser after upload
  - copy link after upload

- [ ] Use [Cap store.ts](../../Cap/apps/desktop/src/store.ts) only as a shape reference, not as a copy target.

## Native Tauri Setup

### `desktop/src-tauri/Cargo.toml`

- [ ] Add only the crates required for v1 capture.
- [ ] Keep dependencies much smaller than [Cap desktop Cargo.toml](../../Cap/apps/desktop/src-tauri/Cargo.toml).
- [ ] Avoid pulling editor/export-related crates into the initial build.

### `desktop/src-tauri/src/main.rs`

- [ ] Register only the commands needed for v1.
- [ ] Keep bootstrapping narrow.
- [ ] Do not accumulate unrelated product logic here.

Reference to avoid:

- [Cap giant lib.rs boot surface](../../Cap/apps/desktop/src-tauri/src/lib.rs)

## Native Permissions And Devices

### `desktop/src-tauri/src/permissions.rs`

- [ ] Implement screen and microphone permission checks.
- [ ] Implement permission request commands.
- [ ] Implement open-settings commands.

Primary reference:

- [Cap permissions.rs](../../Cap/apps/desktop/src-tauri/src/permissions.rs)

### `desktop/src-tauri/src/devices.rs`

- [ ] Enumerate displays.
- [ ] Enumerate windows.
- [ ] Enumerate microphones.
- [ ] Expose system-audio support check.

Primary references:

- [Cap recording.rs device enumeration](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [Cap devices.ts query model](../../Cap/apps/desktop/src/utils/devices.ts)

## Native Recorder

### `desktop/src-tauri/src/recorder.rs`

- [ ] Implement start/pause/resume/stop/cancel lifecycle.
- [ ] Wrap Cap's instant recording ideas, not the Studio model.
- [ ] Normalize the stop result so the renderer receives:
  - output path
  - file size
  - duration
  - thumbnail path if available

Primary references:

- [Cap recording CLI example](../../Cap/crates/recording/examples/recording-cli.rs)
- [Cap instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [Cap recording orchestration](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [Cap project meta output path behavior](../../Cap/crates/project/src/meta.rs)

### `desktop/src-tauri/src/state.rs`

- [ ] Hold current recording actor and status.
- [ ] Keep state ownership explicit and small.

### `desktop/src-tauri/src/errors.rs`

- [ ] Create one coherent error type for user-facing and internal recorder failures.

## Native Upload

### `desktop/src-tauri/src/upload.rs`

- [x] Accept a presigned upload URL and local file path.
- [x] Stream file bytes from Rust.
- [x] Emit progress events.
- [x] Support cancellation.
- [x] Keep implementation single-part in v1.

Primary references:

- [Cap upload.rs](../../Cap/apps/desktop/src-tauri/src/upload.rs)
- [Cap upload API helpers](../../Cap/apps/desktop/src-tauri/src/api.rs)

Use only conceptually:

- retry strategy
- progress reporting
- local file streaming

Do not copy:

- Cap's server-specific multipart contract

## Renderer Components

### `desktop/src/components/PermissionGate.tsx`

- [ ] Block entry into recording flow until required permissions are satisfied.
- [ ] Show direct actions to request permission or open system settings.

Reference:

- [Cap permission query pattern](../../Cap/apps/desktop/src/utils/queries.ts)

### `desktop/src/components/CaptureTargetPicker.tsx`

- [ ] Let user choose display or window.
- [ ] Keep the first version simple.
- [ ] Add thumbnails only if plain text selection is not good enough.

Reference:

- [Cap target picker](../../Cap/apps/desktop/src/routes/target-select-overlay.tsx)

### `desktop/src/components/MicrophonePicker.tsx`

- [ ] Let user choose a microphone or none.
- [ ] Reflect missing permissions clearly.

### `desktop/src/components/ProjectPicker.tsx`

- [ ] Display uploadable projects from `desktopRecorder.listUploadTargets`.
- [ ] Prefer most recent project by default.

Reference:

- [loam upload target logic](../convex/projects.ts)

### `desktop/src/components/RecorderControls.tsx`

- [ ] Render idle, recording, paused, and stopping states.
- [ ] Expose countdown, pause, resume, stop, and cancel.

### `desktop/src/components/UploadProgress.tsx`

- [ ] Show bytes uploaded, percent complete, and cancel button.
- [ ] Keep the tone and pacing fast and clear.

Reference:

- [loam upload progress component](../src/components/upload/UploadProgress.tsx)

## Renderer Routes

### `desktop/src/routes/login.tsx`

- [ ] Host Clerk sign-in flow if boot does not find an authenticated session.

### `desktop/src/routes/recorder.tsx`

- [ ] Combine permissions, device selection, project selection, and start-recording action.

### `desktop/src/routes/uploading.tsx`

- [ ] Drive the upload state machine after recording stops.
- [ ] Prevent accidental navigation during active upload unless user cancels.

### `desktop/src/routes/complete.tsx`

- [ ] Copy the default share URL.
- [ ] Offer `Open in Browser`.
- [ ] Offer `Open Dashboard`.
- [ ] Explain processing state if the share route is not yet playable.

## Integration Helpers

### `desktop/src/lib/tauri.ts`

- [ ] Define the typed native command wrappers.
- [ ] Keep the command surface intentionally small.

Reference:

- [Cap generated tauri.ts](../../Cap/apps/desktop/src/utils/tauri.ts)

### `desktop/src/lib/uploadFlow.ts`

- [ ] Own the renderer side of:
  - `prepareUpload`
  - native `uploadFile`
  - `completeUpload`
  - `failUpload`
- [ ] Keep this the single place where backend and native upload steps are coordinated.

### `desktop/src/lib/desktopAuth.ts`

- [ ] Only create this if Clerk-in-webview is not sufficient.
- [ ] If needed, borrow browser/deep-link ideas from:
  - [Cap auth.ts](../../Cap/apps/desktop/src/utils/auth.ts)
  - [Cap deeplink_actions.rs](../../Cap/apps/desktop/src-tauri/src/deeplink_actions.rs)

## Testing And QA

### Backend

- [ ] Add tests for `desktopRecorder.prepareUpload`.
- [ ] Add tests for `desktopRecorder.completeUpload`.
- [ ] Add tests for `desktopRecorder.failUpload`.

### Native

- [ ] Add a smoke script or example that records a short clip locally.
- [ ] Validate stop-result metadata on disk.

References:

- [Cap real-device tests](../../Cap/crates/recording/examples/real-device-test-runner.rs)
- [Cap playback validation runner](../../Cap/crates/recording/examples/playback-test-runner.rs)

### Manual smoke checklist

- [ ] macOS screen permission denied -> recoverable
- [ ] mic permission denied -> recoverable
- [ ] display recording success
- [ ] window recording success
- [ ] mic on/off success
- [ ] upload success
- [ ] upload cancel
- [ ] upload failure
- [ ] copied share link opens correct `loam` route

## Deferred Work

- [ ] camera overlay
- [ ] screenshots
- [ ] editing
- [ ] background uploads after app restart
- [ ] multipart upload support in `loam`
- [ ] Windows support

## Never Port From Cap

- [ ] full editor surface from [routes/editor](../../Cap/apps/desktop/src/routes/editor/index.tsx)
- [ ] screenshot editor from [routes/screenshot-editor](../../Cap/apps/desktop/src/routes/screenshot-editor/index.tsx)
- [ ] Cap auth store from [auth.rs](../../Cap/apps/desktop/src-tauri/src/auth.rs)
- [ ] Cap backend wrapper from [web_api.rs](../../Cap/apps/desktop/src-tauri/src/web_api.rs)
- [ ] Cap upgrade and plan-gating UX
