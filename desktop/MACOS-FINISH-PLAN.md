# Loam Desktop Recorder macOS Finish Plan

## Goal

Finish the remaining macOS-only validation and release-readiness work without reopening already-landed Linux-safe implementation work.

## Preconditions

- a real macOS machine with screen and microphone permissions available for testing
- Xcode command line tools installed
- Rust and Cargo installed
- Bun installed
- Tauri macOS toolchain installed
- access to the target Loam Convex deployment

## Required environment

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_SITE_URL` or `APP_SITE_URL` if completion payloads should return absolute browser-open URLs

## Step 1 — Refresh Convex codegen

1. From the Loam repo root, configure `CONVEX_DEPLOYMENT` for the intended environment.
2. Run the normal Convex codegen flow.
3. Confirm `../convex/_generated/api.d.ts` includes `desktopRecorder`.
4. Replace manual `desktopRecorder:*` function references in `src/App.tsx` and `src/lib/uploadFlow.ts` with generated `api.desktopRecorder.*` references.
5. Run:

```bash
bun test /home/agent/loam/convex/desktopRecorder.test.ts
bun run build
```

## Step 2 — Run native smoke recording twice

From `src-tauri/`:

```bash
cargo run --example recording-smoke -- 3
```

Run it twice without rebooting the app or machine. Capture for both runs:

- output path
- duration
- file size
- any permission prompts or failures

## Step 3 — Execute manual record-to-share QA

Run and record the outcome for:

- display recording success
- window recording success
- microphone on
- microphone off
- upload success
- upload cancellation
- upload failure
- screen permission denied recovery
- microphone permission denied recovery
- copied share link resolving while playback is still processing
- browser default opening the share page for `ready`, `processing`, and `uploading`
- browser default opening the dashboard for `failed`

## Step 4 — Build the internal macOS app

```bash
VITE_CLERK_PUBLISHABLE_KEY=... \
VITE_CONVEX_URL=... \
bun run tauri:build:macos
```

Confirm:

- `.app` and `.dmg` are produced
- the built app can launch
- at least one happy-path record-to-share run succeeds from the built app

## Artifacts To Capture

- smoke run command output for both native recordings
- manual QA checklist results
- built artifact paths
- any remaining blockers with exact error text and date

## Exit Criteria

- `T001` is marked done with two successful macOS smoke runs
- `T015` is marked done with the manual record-to-share checklist completed
- `T019` is marked done with generated `api.desktopRecorder.*` references in place
- `README.md` and `to-do.json` are updated with the macOS execution results
