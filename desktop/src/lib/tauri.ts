import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type PermissionKind = "screen" | "microphone";
export type PermissionStatus = "notNeeded" | "empty" | "granted" | "denied";

export type PermissionSnapshot = {
  screen: PermissionStatus;
  microphone: PermissionStatus;
};

export type CaptureDisplay = {
  id: string;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
};

export type CaptureWindow = {
  id: string;
  name: string;
  ownerName: string;
};

export type MicrophoneDevice = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type CaptureTarget =
  | {
      kind: "display";
      id: string;
      name: string;
    }
  | {
      kind: "window";
      id: string;
      name: string;
      ownerName: string;
    };

export type StartRecordingInput = {
  target: CaptureTarget;
  microphoneName: string | null;
  captureSystemAudio: boolean;
  countdownSeconds: number;
};

export type RecordingPhase = "recording" | "paused" | "stopping";

export type RecordingSnapshot = {
  phase: RecordingPhase;
  recordingDir: string;
  videoPath: string;
  thumbnailPath: string | null;
  target: CaptureTarget;
  microphoneName: string | null;
  captureSystemAudio: boolean;
};

export type RecordingStopped = {
  recordingDir: string;
  videoPath: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
};

export type DesktopShellStatus = {
  appName: string;
  platform: string;
  shellVersion: string;
};

export type UploadFileInput = {
  uploadUrl: string;
  videoPath: string;
  contentType: string;
  uploadId?: string | null;
};

export type UploadProgressEvent = {
  uploadId: string;
  videoPath: string;
  bytesSent: number;
  totalBytes: number;
  fractionCompleted: number;
};

export type UploadCompleted = {
  uploadId: string;
  videoPath: string;
  totalBytes: number;
  statusCode: number;
};

export type DesktopErrorDetails = {
  code: string;
  message: string;
};

type CommandMap = {
  get_shell_status: DesktopShellStatus;
  open_external_url: void;
  check_permissions: PermissionSnapshot;
  request_permission: PermissionStatus;
  open_permission_settings: void;
  list_capture_displays: CaptureDisplay[];
  list_capture_windows: CaptureWindow[];
  list_microphones: MicrophoneDevice[];
  is_system_audio_supported: boolean;
  start_recording: RecordingSnapshot;
  pause_recording: RecordingSnapshot;
  resume_recording: RecordingSnapshot;
  stop_recording: RecordingStopped;
  cancel_recording: void;
  get_current_recording: RecordingSnapshot | null;
  upload_file: UploadCompleted;
  cancel_upload: void;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const DEFAULT_PERMISSIONS: PermissionSnapshot = {
  screen: "notNeeded",
  microphone: "notNeeded",
};

let browserRecording:
  | {
      snapshot: RecordingSnapshot;
      startedAt: number;
      pausedAt: number | null;
      pausedMs: number;
    }
  | undefined;

function isTauriDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeDesktop<K extends keyof CommandMap>(
  command: K,
  args?: Record<string, unknown>,
): Promise<CommandMap[K]> {
  if (!isTauriDesktop()) {
    return getBrowserFallback(command) as CommandMap[K];
  }

  return invoke<CommandMap[K]>(command, args);
}

function getBrowserFallback<K extends keyof CommandMap>(
  command: K,
): CommandMap[K] {
  switch (command) {
    case "get_shell_status":
      return {
        appName: "loam-desktop",
        platform: "browser",
        shellVersion: "dev",
      } as CommandMap[K];
    case "check_permissions":
      return DEFAULT_PERMISSIONS as CommandMap[K];
    case "request_permission":
      return "notNeeded" as CommandMap[K];
    case "open_permission_settings":
      return undefined as CommandMap[K];
    case "open_external_url":
      return undefined as CommandMap[K];
    case "list_capture_displays":
    case "list_capture_windows":
    case "list_microphones":
      return [] as unknown as CommandMap[K];
    case "is_system_audio_supported":
      return false as CommandMap[K];
    case "start_recording":
    case "pause_recording":
    case "resume_recording":
    case "stop_recording":
    case "cancel_recording":
    case "get_current_recording":
    case "upload_file":
    case "cancel_upload":
      throw new Error(`Command ${command} requires runtime handling`);
    default: {
      const exhaustiveCheck: never = command;
      throw new Error(`Missing browser fallback for ${exhaustiveCheck}`);
    }
  }
}

export function getShellStatus() {
  return invokeDesktop("get_shell_status");
}

export function checkPermissions(initialCheck = false) {
  return invokeDesktop("check_permissions", { initialCheck });
}

export function requestPermission(permission: PermissionKind) {
  return invokeDesktop("request_permission", { permission });
}

export function openPermissionSettings(permission: PermissionKind) {
  return invokeDesktop("open_permission_settings", { permission });
}

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!isTauriDesktop()) {
    if (typeof window === "undefined") {
      return false;
    }

    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    return openedWindow !== null;
  }

  try {
    await invokeDesktop("open_external_url", { url });
    return true;
  } catch {
    return false;
  }
}

export function listCaptureDisplays() {
  return invokeDesktop("list_capture_displays");
}

export function listCaptureWindows() {
  return invokeDesktop("list_capture_windows");
}

export function listMicrophones() {
  return invokeDesktop("list_microphones");
}

export function isSystemAudioSupported() {
  return invokeDesktop("is_system_audio_supported");
}

export async function startRecording(
  input: StartRecordingInput,
): Promise<RecordingSnapshot> {
  if (!isTauriDesktop()) {
    const snapshot: RecordingSnapshot = {
      phase: "recording",
      recordingDir: "/tmp/loam-desktop/browser-recording",
      videoPath: "/tmp/loam-desktop/browser-recording/content/output.mp4",
      thumbnailPath: null,
      target: input.target,
      microphoneName: input.microphoneName,
      captureSystemAudio: input.captureSystemAudio,
    };

    browserRecording = {
      snapshot,
      startedAt: Date.now(),
      pausedAt: null,
      pausedMs: 0,
    };

    return snapshot;
  }

  return invokeDesktop("start_recording", { input });
}

export async function pauseRecording(): Promise<RecordingSnapshot> {
  if (!isTauriDesktop()) {
    if (!browserRecording) {
      throw new Error("No active recording");
    }

    browserRecording.snapshot = {
      ...browserRecording.snapshot,
      phase: "paused",
    };
    browserRecording.pausedAt = Date.now();
    return browserRecording.snapshot;
  }

  return invokeDesktop("pause_recording");
}

export async function resumeRecording(): Promise<RecordingSnapshot> {
  if (!isTauriDesktop()) {
    if (!browserRecording) {
      throw new Error("No active recording");
    }

    if (browserRecording.pausedAt !== null) {
      browserRecording.pausedMs += Date.now() - browserRecording.pausedAt;
    }

    browserRecording.pausedAt = null;
    browserRecording.snapshot = {
      ...browserRecording.snapshot,
      phase: "recording",
    };
    return browserRecording.snapshot;
  }

  return invokeDesktop("resume_recording");
}

export async function stopRecording(): Promise<RecordingStopped> {
  if (!isTauriDesktop()) {
    if (!browserRecording) {
      throw new Error("No active recording");
    }

    const activePauseMs =
      browserRecording.pausedAt === null
        ? 0
        : Date.now() - browserRecording.pausedAt;
    const durationSeconds =
      (Date.now() -
        browserRecording.startedAt -
        browserRecording.pausedMs -
        activePauseMs) /
      1000;

    const stopped: RecordingStopped = {
      recordingDir: browserRecording.snapshot.recordingDir,
      videoPath: browserRecording.snapshot.videoPath,
      thumbnailPath: browserRecording.snapshot.thumbnailPath,
      durationSeconds,
      fileSizeBytes: null,
    };

    browserRecording = undefined;
    return stopped;
  }

  return invokeDesktop("stop_recording");
}

export async function cancelRecording(): Promise<void> {
  if (!isTauriDesktop()) {
    browserRecording = undefined;
    return;
  }

  return invokeDesktop("cancel_recording");
}

export async function getCurrentRecording(): Promise<RecordingSnapshot | null> {
  if (!isTauriDesktop()) {
    return browserRecording?.snapshot ?? null;
  }

  return invokeDesktop("get_current_recording");
}

export function uploadFile(input: UploadFileInput): Promise<UploadCompleted> {
  return invokeDesktop("upload_file", { input });
}

export function cancelUpload(uploadId?: string | null): Promise<void> {
  return invokeDesktop("cancel_upload", {
    uploadId: uploadId ?? null,
  });
}

export async function listenToUploadProgress(
  onProgress: (event: UploadProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriDesktop()) {
    return () => {};
  }

  return listen<UploadProgressEvent>("upload-progress", ({ payload }) => {
    onProgress(payload);
  });
}

export function describeDesktopError(error: unknown): DesktopErrorDetails {
  const rawMessage =
    error instanceof Error && error.message ? error.message : "Unknown desktop error";
  const [code, detail] = rawMessage.split(/\/(.+)/, 2);

  switch (code) {
    case "MissingScreenPermission":
      return {
        code,
        message:
          "Screen recording permission is still blocked. Grant access in system settings, then refresh targets.",
      };
    case "MissingMicrophonePermission":
      return {
        code,
        message:
          "Microphone access is blocked. Enable it in system settings or record with the microphone turned off.",
      };
    case "MicrophoneNotFound":
      return {
        code,
        message:
          "The selected microphone is no longer available. Refresh devices and choose another microphone or turn it off.",
      };
    case "TargetNotFound":
      return {
        code,
        message:
          "The selected display or window disappeared. Refresh targets and choose another capture target.",
      };
    case "UploadCancelled":
      return {
        code,
        message: "Upload cancelled.",
      };
    case "UploadTooLarge":
      return {
        code,
        message:
          "This recording is larger than Loam's 5 GiB direct-upload limit. Keep the local file or record a shorter clip.",
      };
    case "UploadFailed":
      return {
        code,
        message: detail ? `Upload failed: ${detail}` : "Upload failed.",
      };
    case "InvalidExternalUrl":
      return {
        code,
        message: "Loam rejected the browser destination because it was not a valid http(s) URL.",
      };
    case "ExternalOpenFailed":
      return {
        code,
        message: detail ? `Loam could not open the browser: ${detail}` : "Loam could not open the browser.",
      };
    default:
      return {
        code,
        message: rawMessage,
      };
  }
}
