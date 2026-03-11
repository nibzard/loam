import { useState } from "react";
import type {
  CaptureTarget,
  MicrophoneDevice,
  RecordingSnapshot,
  RecordingStopped,
} from "../lib/tauri";
import {
  cancelRecording,
  describeDesktopError,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
} from "../lib/tauri";

type ControlsProps = {
  target: CaptureTarget | null;
  microphoneId: string | null;
  microphones: MicrophoneDevice[];
  countdownSeconds: number;
  captureSystemAudio: boolean;
  systemAudioSupported: boolean;
  recording: RecordingSnapshot | null;
  lastStopped: RecordingStopped | null;
  error: string | null;
  selectedProjectName: string | null;
  onRecordingChange: (recording: RecordingSnapshot | null) => void;
  onStopped?: (recording: RecordingStopped) => void;
  onErrorChange?: (error: string | null) => void;
  onRecoverableError?: (errorCode: string) => void;
};

export function RecorderControls({
  target,
  microphoneId,
  microphones,
  countdownSeconds,
  captureSystemAudio,
  systemAudioSupported,
  recording,
  lastStopped,
  error,
  selectedProjectName,
  onRecordingChange,
  onStopped,
  onErrorChange,
  onRecoverableError,
}: ControlsProps) {
  const [pending, setPending] = useState<"start" | "pause" | "resume" | "stop" | "cancel" | null>(
    null,
  );
  const selectedMicrophone =
    microphoneId === null
      ? null
      : microphones.find((device) => device.id === microphoneId) ?? null;
  const canStart =
    target !== null &&
    selectedProjectName !== null &&
    pending === null &&
    recording === null;

  async function run(action: typeof pending, fn: () => Promise<void>) {
    setPending(action);
    onErrorChange?.(null);

    try {
      await fn();
    } catch (nextError) {
      const details = describeDesktopError(nextError);
      onErrorChange?.(details.message);

      if (
        details.code === "MissingScreenPermission" ||
        details.code === "MissingMicrophonePermission" ||
        details.code === "MicrophoneNotFound" ||
        details.code === "TargetNotFound"
      ) {
        onRecoverableError?.(details.code);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="recorder-controls">
      <div className="panel-header">
        <div>
          <p className="eyebrow">native recorder</p>
          <h2>Recording lifecycle</h2>
        </div>
        <div className="metric">
          <span>Current phase</span>
          <strong>{recording?.phase ?? "idle"}</strong>
        </div>
      </div>

      <div className="recording-summary">
        <strong>Ready check</strong>
        <p>
          Target: {target ? target.name : "Choose a display or window"} · Project:{" "}
          {selectedProjectName ?? "Choose a Loam project"}
        </p>
        <p>
          Microphone: {selectedMicrophone?.name ?? "Off"} · System audio:{" "}
          {captureSystemAudio && systemAudioSupported ? "On" : "Off"} · Countdown:{" "}
          {countdownSeconds}s
        </p>
      </div>

      <div className="button-row">
        <button
          className="button button-primary"
          disabled={!canStart}
          type="button"
          onClick={() =>
            run("start", async () => {
              const started = await startRecording({
                target: target!,
                microphoneName: selectedMicrophone?.name ?? null,
                captureSystemAudio,
                countdownSeconds,
              });
              onRecordingChange(started);
            })
          }
        >
          {pending === "start" ? "Starting..." : "Start recording"}
        </button>

        <button
          className="button"
          disabled={recording?.phase !== "recording" || pending !== null}
          type="button"
          onClick={() =>
            run("pause", async () => {
              onRecordingChange(await pauseRecording());
            })
          }
        >
          Pause
        </button>

        <button
          className="button"
          disabled={recording?.phase !== "paused" || pending !== null}
          type="button"
          onClick={() =>
            run("resume", async () => {
              onRecordingChange(await resumeRecording());
            })
          }
        >
          Resume
        </button>

        <button
          className="button button-primary"
          disabled={recording === null || pending !== null}
          type="button"
          onClick={() =>
            run("stop", async () => {
              const stopped = await stopRecording();
              onRecordingChange(null);
              onStopped?.(stopped);
            })
          }
        >
          {pending === "stop" ? "Stopping..." : "Stop"}
        </button>

        <button
          className="button button-danger"
          disabled={recording === null || pending !== null}
          type="button"
          onClick={() =>
            run("cancel", async () => {
              await cancelRecording();
              onRecordingChange(null);
            })
          }
        >
          Cancel
        </button>
      </div>

      {recording ? (
        <div className="recording-summary">
          <strong>Active output</strong>
          <code>{recording.videoPath}</code>
        </div>
      ) : null}

      {lastStopped ? (
        <div className="recording-summary success">
          <strong>Last stop payload</strong>
          <p>{lastStopped.videoPath}</p>
          <p>
            Duration: {formatMaybeNumber(lastStopped.durationSeconds)}s · Size:{" "}
            {formatMaybeNumber(lastStopped.fileSizeBytes)} bytes
          </p>
        </div>
      ) : null}

      {error ? <p className="error-copy">{error}</p> : null}
    </section>
  );
}
function formatMaybeNumber(value: number | null) {
  return value === null ? "unknown" : value.toFixed(value > 10 ? 0 : 1);
}
