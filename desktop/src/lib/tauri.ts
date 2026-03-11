import { invoke } from "@tauri-apps/api/core";

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

export type DesktopShellStatus = {
  appName: string;
  platform: string;
  shellVersion: string;
};

type CommandMap = {
  get_shell_status: DesktopShellStatus;
  check_permissions: PermissionSnapshot;
  request_permission: PermissionStatus;
  open_permission_settings: void;
  list_capture_displays: CaptureDisplay[];
  list_capture_windows: CaptureWindow[];
  list_microphones: MicrophoneDevice[];
  is_system_audio_supported: boolean;
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
    case "list_capture_displays":
    case "list_capture_windows":
    case "list_microphones":
      return [] as unknown as CommandMap[K];
    case "is_system_audio_supported":
      return false as CommandMap[K];
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
