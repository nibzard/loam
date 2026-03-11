import type { PermissionSnapshot, RecordingSnapshot } from "../lib/tauri";
import type { CompleteUploadResult, UploadFlowSnapshot } from "../lib/uploadFlow";

export type AppLifecycleState =
  | "booting"
  | "authRequired"
  | "permissionsRequired"
  | "ready"
  | "recording"
  | "paused"
  | "uploading"
  | "complete"
  | "error";

export type AppStateInput = {
  authLoaded: boolean;
  isSignedIn: boolean;
  permissions: PermissionSnapshot | null;
  recording: RecordingSnapshot | null;
  upload: UploadFlowSnapshot | null;
  completion: CompleteUploadResult | null;
  error: string | null;
};

export function deriveAppLifecycleState(input: AppStateInput): AppLifecycleState {
  if (!input.authLoaded) {
    return "booting";
  }

  if (!input.isSignedIn) {
    return "authRequired";
  }

  if (input.error) {
    return "error";
  }

  if (input.upload && !["failed", "cancelled"].includes(input.upload.step)) {
    return input.upload.step === "complete" ? "complete" : "uploading";
  }

  if (input.completion) {
    return "complete";
  }

  if (input.recording?.phase === "paused") {
    return "paused";
  }

  if (input.recording) {
    return "recording";
  }

  if (requiresPermissions(input.permissions)) {
    return "permissionsRequired";
  }

  return "ready";
}

function requiresPermissions(permissions: PermissionSnapshot | null) {
  if (!permissions) {
    return false;
  }

  return permissions.screen === "denied" || permissions.screen === "empty";
}
