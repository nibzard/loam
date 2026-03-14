# Loam Desktop Recorder Architecture

## Goal

Build a minimal native recorder that gets a user from target selection to a shareable `loam` link with the least possible friction.

The desktop app is not a second product surface. It is a focused capture-and-upload client for the existing `loam` web product.

## Non-Goals

- Porting Cap Desktop wholesale
- Building a full editing workflow
- Supporting screenshots in v1
- Shipping camera overlays in v1
- Replacing `loam`'s current upload, playback, or share-link semantics
- Re-implementing `loam` auth in Rust

## Product Contract

The v1 user flow is:

1. User signs in with the same Clerk identity they already use in `loam`
2. App checks capture permissions
3. User picks a display or window
4. User optionally picks a microphone and system-audio capture
5. User chooses a target project
6. App records locally
7. User stops recording
8. App uploads the final video file to `loam`'s S3 bucket using a presigned URL
9. `loam` starts Mux ingestion
10. App creates or resolves a share link and copies it
11. App offers `Open in Browser`

The output of the recorder is not a Cap project that the user edits. The output is a shareable `loam` video record plus a local fallback file.

## Core Decision

Use Cap as a native recording reference and crate reference.

Do not use Cap as:

- the application shell
- the auth model
- the backend contract
- the product UI

## Why This Architecture

`loam` is already opinionated about auth, projects, uploads, playback, and share links:

- [Clerk provider](../src/lib/clerk.tsx)
- [projects.listUploadTargets](../convex/projects.ts)
- [videos.create](../convex/videos.ts)
- [videoActions.getUploadUrl](../convex/videoActions.ts)
- [videoActions.markUploadComplete](../convex/videoActions.ts)
- [shareLinks.create](../convex/shareLinks.ts)

Cap is much stronger on native capture and lifecycle management:

- [recording CLI example](../../Cap/crates/recording/examples/recording-cli.rs)
- [recording crate API](../../Cap/crates/recording/src/lib.rs)
- [instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [desktop permission handling](../../Cap/apps/desktop/src-tauri/src/permissions.rs)
- [desktop recording orchestration](../../Cap/apps/desktop/src-tauri/src/recording.rs)

The correct split is to let each codebase keep the area it already owns well.

## Current Repo Shape

```text
.
  README.md
  ARCHITECTURE.md
  IMPLEMENTATION-PLAN.md
  BACKLOG.md
  MACOS-FINISH-PLAN.md
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    routes/
      login.tsx
      recorder.tsx
      uploading.tsx
      complete.tsx
    components/
      PermissionGate.tsx
      CaptureTargetPicker.tsx
      MicrophonePicker.tsx
      ProjectPicker.tsx
      RecorderControls.tsx
      UploadProgress.tsx
    lib/
      clerk.tsx
      convex.tsx
      tauri.ts
      routes.ts
      desktopAuth.ts
      uploadFlow.ts
    state/
      app-state.ts
      recorder-state.ts
      settings-state.ts
  src-tauri/
    Cargo.toml
    tauri.conf.json
    examples/
      recording-smoke.rs
    src/
      browser.rs
      main.rs
      permissions.rs
      devices.rs
      recorder.rs
      upload.rs
      state.rs
      errors.rs
```

## Ownership Boundaries

### Renderer owns

- Clerk session
- Convex queries and actions
- project selection
- permission UI
- countdown UI
- recording status UI
- upload orchestration
- share-link copy/open behavior

### Rust owns

- OS permissions checks and prompts
- device enumeration
- capture target enumeration
- native recording actor lifecycle
- local file output
- byte-stream upload from local file path to presigned URL
- progress events during upload
- cancellation of the active native upload request

### Convex owns

- upload authorization
- file metadata persistence
- video record creation
- ingest state transitions
- playback state
- share-link issuance
- team/project authorization

## Native Command Surface

The Tauri surface should stay intentionally small.

```ts
type PermissionKind = "screen" | "microphone"

type CaptureTarget =
  | { kind: "display"; id: string; name: string }
  | { kind: "window"; id: string; name: string; ownerName: string }

type StartRecordingInput = {
  target: CaptureTarget
  microphoneName: string | null
  captureSystemAudio: boolean
  countdownSeconds: number
}

type RecordingStopped = {
  recordingDir: string
  videoPath: string
  thumbnailPath: string | null
  durationSeconds: number | null
  fileSizeBytes: number | null
}
```

Minimum commands:

- `checkPermissions()`
- `requestPermission(permission)`
- `openPermissionSettings(permission)`
- `listCaptureDisplays()`
- `listCaptureWindows()`
- `listMicrophones()`
- `isSystemAudioSupported()`
- `startRecording(input)`
- `pauseRecording()`
- `resumeRecording()`
- `stopRecording()`
- `cancelRecording()`
- `getCurrentRecording()`
- `uploadFile(input)`
- `cancelUpload(uploadId?)`

Source references:

- [Cap permissions](../../Cap/apps/desktop/src-tauri/src/permissions.rs)
- [Cap StartRecordingInputs](../../Cap/apps/desktop/src-tauri/src/recording.rs)
- [Cap device snapshot ideas](../../Cap/apps/desktop/src/utils/devices.ts)
- [Cap generated Tauri command surface](../../Cap/apps/desktop/src/utils/tauri.ts)

## Backend Contract

Keep the desktop-specific Convex surface small instead of spreading recorder logic across multiple UI calls.

Current `../convex/desktopRecorder.ts` public surface:

- `listUploadTargets`
- `prepareUpload`
- `completeUpload`
- `failUpload`

The renderer should prefer these entrypoints over reaching into `projects` and `videoActions` directly. Until Convex codegen is refreshed on a configured deployment, the desktop app may need manual function references for this module.

### `prepareUpload`

Input:

- `projectId`
- `title`
- `fileSize`
- `contentType`

Output:

- `videoId`
- `publicId`
- `uploadUrl`
- `uploadKey`

Implementation should wrap:

- [videos.create](../convex/videos.ts)
- [videoActions.getUploadUrl](../convex/videoActions.ts)

### `completeUpload`

Input:

- `videoId`

Output:

- `videoId`
- `status`
- `shareUrl`
- `canonicalDashboardUrl`

Implementation should:

1. call [videoActions.markUploadComplete](../convex/videoActions.ts)
2. create or fetch a share link via [shareLinks.create](../convex/shareLinks.ts)
3. build canonical URLs using [workspace.resolveContext](../convex/workspace.ts)

### `failUpload`

Input:

- `videoId`
- optional `message`

Implementation should wrap [videoActions.markUploadFailed](../convex/videoActions.ts).

## Auth Strategy

Preferred path:

- use Clerk inside the desktop renderer
- use Convex from the renderer with the same auth model as the web app

Why:

- it matches `loam`'s existing trust boundaries
- it avoids teaching Rust about Clerk tokens and Convex auth
- it keeps backend calls consistent with the existing app

Only use Cap's browser/deep-link auth mechanics as a fallback reference if Clerk in Tauri proves unreliable:

- [Cap sign-in flow](../../Cap/apps/desktop/src/utils/auth.ts)
- [Cap deep-link action parsing](../../Cap/apps/desktop/src-tauri/src/deeplink_actions.rs)

Do not port:

- [Cap AuthStore](../../Cap/apps/desktop/src-tauri/src/auth.rs)
- [Cap authed API wrapper](../../Cap/apps/desktop/src-tauri/src/web_api.rs)

## Recording Strategy

Use Cap's instant-recording pattern, not its Studio product.

Primary references:

- [instant recording actor](../../Cap/crates/recording/src/instant_recording.rs)
- [recording crate root](../../Cap/crates/recording/src/lib.rs)
- [recording CLI example](../../Cap/crates/recording/examples/recording-cli.rs)

Key decisions:

- no pause-separated multi-segment editing model exposed to user
- local recording bundle may still use Cap's internal project layout
- renderer only needs the final `output.mp4` path and metadata

Internal simplification:

- Rust may reuse Cap's local project layout with `recording-meta.json` and `content/output.mp4`
- JS never needs to understand that format in depth

Useful references:

- [Cap project metadata and output path rules](../../Cap/crates/project/src/meta.rs)
- [Cap recording orchestration and save behavior](../../Cap/apps/desktop/src-tauri/src/recording.rs)

## Upload Strategy

Keep the `loam` backend in charge of authorization and Mux ingest.

Flow:

1. Renderer calls `desktopRecorder.prepareUpload`
2. Renderer passes `uploadUrl` and `videoPath` to Rust
3. Rust streams file bytes to S3 and emits progress
4. Renderer calls `desktopRecorder.completeUpload`
5. Renderer copies returned share URL

Why not copy Cap's multipart server contract:

- Cap's upload API is server-specific and tightly coupled:
  - [upload_multipart_initiate](../../Cap/apps/desktop/src-tauri/src/api.rs)
  - [upload_multipart_complete](../../Cap/apps/desktop/src-tauri/src/api.rs)
  - [upload.rs](../../Cap/apps/desktop/src-tauri/src/upload.rs)
- `loam` already has a simpler presigned PUT flow:
  - [videoActions.getUploadUrl](../convex/videoActions.ts)
  - [videoActions.markUploadComplete](../convex/videoActions.ts)

V1 constraint:

- respect `loam`'s current 5 GiB single-upload limit in [videoActions.ts](../convex/videoActions.ts)
- if that limit becomes painful, add multipart support later

## State Model

Renderer app states:

- `booting`
- `authRequired`
- `permissionsRequired`
- `ready`
- `countdown`
- `recording`
- `paused`
- `stopping`
- `uploading`
- `complete`
- `error`

Rust recording states:

- `idle`
- `recording`
- `paused`
- `stopped`

Cap references:

- [Cap recording actor state](../../Cap/crates/recording/src/instant_recording.rs)
- [Cap desktop recording state machine](../../Cap/apps/desktop/src-tauri/src/recording.rs)

## Local Persistence

Persist only:

- `lastProjectId`
- `lastMicrophoneName`
- `captureSystemAudio`
- `countdownSeconds`
- `openBrowserAfterUpload`
- `copyLinkAfterUpload`

Good reference for shape, not for direct reuse:

- [Cap desktop store wrapper](../../Cap/apps/desktop/src/store.ts)

## Platform Plan

### macOS first

Reasons:

- Cap's ScreenCaptureKit path is mature
- your local machine is macOS
- it reduces surface area while the backend contract settles

Key references:

- [Cap macOS permissions](../../Cap/apps/desktop/src-tauri/src/permissions.rs)
- [Cap recording crate screen capture sources](../../Cap/crates/recording/src)

### Windows later

Only start Windows after macOS record-to-share is stable.

Reference later:

- [Cap Windows paths in the recording crate](../../Cap/crates/recording/src)

## What To Explicitly Ignore In Cap

- [editor routes](../../Cap/apps/desktop/src/routes/editor/index.tsx)
- [screenshot editor routes](../../Cap/apps/desktop/src/routes/screenshot-editor/index.tsx)
- [desktop auth and plan checks](../../Cap/apps/desktop/src-tauri/src/auth.rs)
- [desktop server URL customization](../../Cap/apps/desktop/src-tauri/src/web_api.rs)
- [desktop upgrade/product gating UI](../../Cap/apps/desktop/src/routes/(window-chrome)/upgrade.tsx)
- [large Tauri boot surface](../../Cap/apps/desktop/src-tauri/src/lib.rs)

## Acceptance Criteria For V1

- A signed-in user can open the desktop app and see accessible upload targets from `loam`
- The app can record a display or a window on macOS
- Mic capture works when permission is granted
- Upload progress is visible
- Upload completion creates a valid `loam` video record
- The app copies a working `/share/{token}` link by default
- If Mux is still processing, the share page still behaves correctly
- Permission failures and upload failures are recoverable without restarting the app

## Primary Risks

### Clerk inside Tauri

This is the main integration risk. If it works, the rest of the architecture stays much cleaner.

### Native capture complexity

Cap's recording crate is capable, but it was built for a much larger product. The risk is not basic capture, but keeping the wrapper thin enough.

### Upload size ceiling

`loam` currently uses single-part presigned PUTs. That is excellent for simplicity and good enough for v1, but it becomes a product limit for very large recordings.

### License hygiene

If substantial Cap code is transplanted, treat license obligations seriously. The safer approach is to reimplement thin wrappers while using Cap as a structural reference.
