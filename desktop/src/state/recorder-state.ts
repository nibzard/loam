import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CaptureDisplay,
  CaptureTarget,
  CaptureWindow,
  MicrophoneDevice,
  RecordingSnapshot,
  RecordingStopped,
} from "../lib/tauri";
import type { CompleteUploadResult, UploadFlowSnapshot } from "../lib/uploadFlow";

export type UploadProject = {
  projectId: Id<"projects">;
  projectName: string;
  teamName: string;
  teamSlug: string;
};

export type RecorderSelection = {
  projectId: Id<"projects"> | null;
  target: CaptureTarget | null;
  microphoneId: string | null;
  countdownSeconds: number;
  captureSystemAudio: boolean;
};

export type RecorderState = {
  selection: RecorderSelection;
  recording: RecordingSnapshot | null;
  lastStopped: RecordingStopped | null;
  upload: UploadFlowSnapshot | null;
  completion: CompleteUploadResult | null;
  error: string | null;
};

export function createRecorderState(selection: RecorderSelection): RecorderState {
  return {
    selection,
    recording: null,
    lastStopped: null,
    upload: null,
    completion: null,
    error: null,
  };
}

export function buildTargetKey(target: CaptureTarget | null) {
  if (!target) {
    return "";
  }

  return `${target.kind}:${target.id}`;
}

export function resolveTarget(
  selectedTargetKey: string,
  displays: CaptureDisplay[],
  windows: CaptureWindow[],
): CaptureTarget | null {
  const [kind, id] = selectedTargetKey.split(":");

  if (!kind || !id) {
    return null;
  }

  if (kind === "display") {
    const display = displays.find((candidate) => candidate.id === id);
    return display
      ? {
          kind: "display",
          id: display.id,
          name: display.name,
        }
      : null;
  }

  if (kind === "window") {
    const window = windows.find((candidate) => candidate.id === id);
    return window
      ? {
          kind: "window",
          id: window.id,
          name: window.name,
          ownerName: window.ownerName,
        }
      : null;
  }

  return null;
}

export function resolvePreferredProject(
  projects: UploadProject[] | undefined,
  preferredProjectId: string | null,
) {
  if (!projects || projects.length === 0) {
    return null;
  }

  if (preferredProjectId) {
    const preferred = projects.find((project) => project.projectId === preferredProjectId);
    if (preferred) {
      return preferred;
    }
  }

  return projects[0];
}

export function resolvePreferredMicrophone(
  microphones: MicrophoneDevice[],
  preferredMicrophoneId: string | null,
) {
  if (preferredMicrophoneId) {
    const preferred = microphones.find((device) => device.id === preferredMicrophoneId);
    if (preferred) {
      return preferred;
    }
  }

  return microphones.find((device) => device.isDefault) ?? microphones[0] ?? null;
}
