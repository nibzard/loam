# Loam Desktop Recorder Implementation Plan

## Status

Planning complete. Native recording and native upload streaming are in progress.

## Delivery Principle

Ship the smallest path from native record to default share link. Every phase should preserve that outcome.

## Phase 0 — Native Feasibility Spike

## Goal

Prove that local recording works on your machine before any desktop product scaffolding.

## Tasks

- Create a temporary Rust or Tauri spike that records the primary display for 5 seconds.
- Validate local file output and duration metadata.
- Confirm microphone capture can be added without destabilizing the base flow.

## Cap references

- [recording CLI example](../../Cap/crates/recording/examples/recording-cli.rs)
- [instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [recording crate root](../../Cap/crates/recording/src/lib.rs)

## Exit criteria

- One local mp4 file is produced successfully on macOS.
- A second run also succeeds without rebooting the app or machine.

## Phase 1 — Backend Contract For Desktop

## Goal

Create a desktop-oriented Convex surface so the renderer does not have to stitch together multiple loosely related actions.

## Files

- create `../convex/desktopRecorder.ts`
- update `../convex/_generated` through normal Convex codegen flow

## Tasks

- Add `listUploadTargets` wrapper for the desktop UI.
- Add `prepareUpload` action that internally calls:
  - [videos.create](../convex/videos.ts)
  - [videoActions.getUploadUrl](../convex/videoActions.ts)
- Add `completeUpload` action that internally calls:
  - [videoActions.markUploadComplete](../convex/videoActions.ts)
  - [shareLinks.create](../convex/shareLinks.ts)
  - [workspace.resolveContext](../convex/workspace.ts)
- Add `failUpload` action that wraps [videoActions.markUploadFailed](../convex/videoActions.ts).

## Notes

- Keep project and team authorization inside Convex.
- Return the final `shareUrl` from the backend so the renderer does not have to compose it manually.

## Exit criteria

- The desktop renderer can prepare an upload with one call.
- The desktop renderer can complete an upload with one call and receive a share URL.

## Phase 2 — Desktop App Scaffold

## Goal

Create the new desktop app surface in `loam`.

## Files

- create `desktop/package.json`
- create `desktop/tsconfig.json`
- create `desktop/vite.config.ts`
- create `desktop/src/main.tsx`
- create `desktop/src/App.tsx`
- create `desktop/src/lib/clerk.tsx`
- create `desktop/src/lib/convex.tsx`

## Tasks

- Set up a React + Tauri renderer.
- Reuse the `loam` design language, not Cap's visual language.
- Mount Clerk and Convex providers in the desktop renderer.
- Establish a single-app route shell with a minimal set of screens:
  - login
  - permissions
  - recorder
  - uploading
  - complete

## Loam references

- [Clerk provider](../src/lib/clerk.tsx)
- [dashboard upload layout patterns](../app/routes/dashboard/-layout.tsx)

## Exit criteria

- Desktop app boots to a React screen.
- Clerk and Convex can initialize inside the app.

## Phase 3 — Permissions And Devices

## Goal

Expose a stable minimal native command surface for permissions and device enumeration.

## Files

- create `desktop/src-tauri/src/permissions.rs`
- create `desktop/src-tauri/src/devices.rs`
- create `desktop/src-tauri/src/main.rs`
- create `desktop/src/lib/tauri.ts`
- create `desktop/src/state/settings-state.ts`
- create `desktop/src/components/PermissionGate.tsx`

## Tasks

- Implement screen and microphone permission checks.
- Implement permission request and settings-open commands.
- Implement device enumeration:
  - displays
  - windows
  - microphones
- Add polling or event-driven refresh for changing device lists.

## Cap references

- [permissions.rs](../../Cap/apps/desktop/src-tauri/src/permissions.rs)
- [devices.ts](../../Cap/apps/desktop/src/utils/devices.ts)
- [queries.ts permissions and device queries](../../Cap/apps/desktop/src/utils/queries.ts)

## Exit criteria

- User can see whether screen and mic permissions are granted.
- User can enumerate targets and microphones from the renderer.

## Phase 4 — Capture Target And Project Selection UI

## Goal

Build the opinionated pre-recording UI.

## Files

- create `desktop/src/routes/recorder.tsx`
- create `desktop/src/components/CaptureTargetPicker.tsx`
- create `desktop/src/components/MicrophonePicker.tsx`
- create `desktop/src/components/ProjectPicker.tsx`
- create `desktop/src/state/app-state.ts`
- create `desktop/src/state/recorder-state.ts`
- create `desktop/src/lib/routes.ts`

## Tasks

- Query `desktopRecorder.listUploadTargets`.
- Let the user pick one project as the upload destination.
- Let the user pick one capture target.
- Let the user pick `mic on/off`.
- Let the user pick `system audio on/off` where supported.
- Persist the last used project and mic.

## Cap references

- [target-select-overlay.tsx](../../Cap/apps/desktop/src/routes/target-select-overlay.tsx)
- [recording options query](../../Cap/apps/desktop/src/utils/queries.ts)

## Exit criteria

- A user can configure a complete valid recording request without leaving one screen.

## Phase 5 — Recording Lifecycle

## Goal

Wrap Cap-style native recording into a small recorder command set.

## Files

- create `desktop/src-tauri/src/recorder.rs`
- create `desktop/src-tauri/src/state.rs`
- create `desktop/src-tauri/src/errors.rs`
- update `desktop/src-tauri/src/main.rs`
- update `desktop/src/lib/tauri.ts`
- create `desktop/src/components/RecorderControls.tsx`

## Tasks

- Implement `startRecording`.
- Implement `pauseRecording`.
- Implement `resumeRecording`.
- Implement `stopRecording`.
- Implement `cancelRecording`.
- Implement `getCurrentRecording`.
- Return a normalized stopped-recording payload that includes final output file path and basic metadata.

## Cap references

- [StartRecordingInputs and orchestration](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [recording crate root](../../Cap/crates/recording/src/lib.rs)
- [Cap project output path behavior](../../Cap/crates/project/src/meta.rs)

## Exit criteria

- A recording can start, pause, resume, and stop from the desktop UI.
- On stop, the renderer receives a file path that exists on disk.

## Phase 6 — Upload Pipeline

## Goal

Upload the local output file into `loam` using `prepareUpload` and `completeUpload`.

## Files

- create `desktop/src-tauri/src/upload.rs`
- create `desktop/src/lib/uploadFlow.ts`
- create `desktop/src/components/UploadProgress.tsx`
- create `desktop/src/routes/uploading.tsx`

## Tasks

- Use `desktopRecorder.prepareUpload` from the renderer.
- Pass `videoPath` and `uploadUrl` into Rust.
- Stream bytes from Rust to S3 with progress events.
- On success, call `desktopRecorder.completeUpload`.
- On error or cancellation, call `desktopRecorder.failUpload`.

## Cap references

- [upload.rs](../../Cap/apps/desktop/src-tauri/src/upload.rs)
- [upload API helper ideas](../../Cap/apps/desktop/src-tauri/src/api.rs)

## Loam references

- [videoActions.getUploadUrl](../convex/videoActions.ts)
- [videoActions.markUploadComplete](../convex/videoActions.ts)
- [videoActions.markUploadFailed](../convex/videoActions.ts)
- [dashboard upload manager](../app/routes/dashboard/-useVideoUploadManager.ts)

## Exit criteria

- A completed recording can upload successfully.
- Progress is visible in the renderer.
- Failed uploads do not leave the renderer and backend in inconsistent states.

## Phase 7 — Share-Link Completion Flow

## Goal

Make the post-upload result feel immediate even while Mux is still preparing playback.

## Files

- create `desktop/src/routes/complete.tsx`
- update `desktop/src/lib/uploadFlow.ts`

## Tasks

- Copy the share URL returned by `desktopRecorder.completeUpload`.
- Offer `Open in Browser`.
- Offer `Open Dashboard`.
- Show processing copy when playback is not ready yet.

## Loam references

- [shareLinks.create](../convex/shareLinks.ts)
- [share route behavior](../app/routes/share.$token.tsx)
- [watch/share route status handling](../app/routes/-share.tsx)

## Exit criteria

- The default success outcome is a copied share URL.
- The share URL resolves even if the video is still processing.

## Phase 8 — Hardening And Product Fit

## Goal

Close the gaps that make capture apps feel fragile.

## Files

- update `desktop/src-tauri/src/recorder.rs`
- update `desktop/src-tauri/src/upload.rs`
- update `desktop/src/routes/recorder.tsx`
- update `desktop/src/components/PermissionGate.tsx`

## Tasks

- Handle permission denial cleanly.
- Handle missing microphone device cleanly.
- Handle target disappearance.
- Handle upload cancellation.
- Handle app close during upload.
- Add explicit file-size check before upload using `loam`'s 5 GiB constraint.

## Cap references

- [recording state and error branches](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [permission statuses](../../Cap/apps/desktop/src-tauri/src/permissions.rs)

## Exit criteria

- The recorder can recover from the common failure paths without forcing a full restart.

## Phase 9 — QA And Smoke Coverage

## Goal

Verify the recorder as a product flow, not just as isolated functions.

## Tasks

- Add renderer-level smoke tests where realistic.
- Add Convex tests for `desktopRecorder`.
- Run manual native smoke flows:
  - display recording
  - window recording
  - mic on/off
  - upload success
  - upload failure
  - permission denied
  - share link copy/open

## Cap references

- [real-device-test-runner.rs](../../Cap/crates/recording/examples/real-device-test-runner.rs)
- [playback-test-runner.rs](../../Cap/crates/recording/examples/playback-test-runner.rs)

## Exit criteria

- You can reliably record, upload, and share from one machine with no manual backend repair.

## Phase 10 — Windows Follow-Up

## Goal

Expand platform coverage after macOS is stable.

## Tasks

- Evaluate the Windows path in Cap's recording crate.
- Keep the same renderer contract and replace only the native platform handling.

## Cap references

- [recording crate platform-specific implementation areas](../../Cap/crates/recording/src)

## Exit criteria

- Windows support is treated as a new platform port, not as a blocker for macOS launch.

## Recommended PR Slices

1. `feat: add desktop recorder backend contract`
2. `feat: scaffold loam desktop app`
3. `feat: add desktop permissions and device enumeration`
4. `feat: add recorder setup screen`
5. `feat: add native recording lifecycle`
6. `feat: add desktop upload pipeline`
7. `feat: add share-link completion flow`
8. `improve: harden desktop recorder failure handling`

## Must-Not-Do List

- Do not port Cap's editor.
- Do not port Cap's auth/session model.
- Do not build a giant one-file `lib.rs` like Cap.
- Do not let Rust call Convex directly if the renderer can own that call more simply.
- Do not add multipart upload to `loam` until single-part upload proves insufficient.
