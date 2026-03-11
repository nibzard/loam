import { useEffect, useState } from "react";
import type {
  CaptureDisplay,
  CaptureWindow,
  MicrophoneDevice,
  RecordingSnapshot,
  RecordingStopped,
} from "../lib/tauri";
import {
  cancelRecording,
  getCurrentRecording,
  isSystemAudioSupported,
  listCaptureDisplays,
  listCaptureWindows,
  listMicrophones,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
} from "../lib/tauri";
import { resolvePreferredMicrophone, resolveTarget, type RecorderSelection } from "../state/recorder-state";

type ControlsProps = {
  shellReady: boolean;
  selection: RecorderSelection;
  recording: RecordingSnapshot | null;
  lastStopped: RecordingStopped | null;
  error: string | null;
  onSelectionChange: (updates: Partial<RecorderSelection>) => void;
  onRecordingChange: (recording: RecordingSnapshot | null) => void;
  onStopped?: (recording: RecordingStopped) => void;
  onErrorChange?: (error: string | null) => void;
};

export function RecorderControls({
  shellReady,
  selection,
  recording,
  lastStopped,
  error,
  onSelectionChange,
  onRecordingChange,
  onStopped,
  onErrorChange,
}: ControlsProps) {
  const [displays, setDisplays] = useState<CaptureDisplay[]>([]);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [systemAudioSupported, setSystemAudioSupported] = useState(false);
  const [pending, setPending] = useState<"start" | "pause" | "resume" | "stop" | "cancel" | null>(null);

  useEffect(() => {
    if (!shellReady) {
      return;
    }

    let cancelled = false;

    async function hydrate() {
      try {
        const [nextDisplays, nextWindows, nextMicrophones, current, supportsSystemAudio] =
          await Promise.all([
            listCaptureDisplays(),
            listCaptureWindows(),
            listMicrophones(),
            getCurrentRecording(),
            isSystemAudioSupported(),
          ]);

        if (cancelled) {
          return;
        }

        setDisplays(nextDisplays);
        setWindows(nextWindows);
        setMicrophones(nextMicrophones);
        onRecordingChange(current);
        setSystemAudioSupported(supportsSystemAudio);

        if (!selection.target) {
          const defaultDisplay = nextDisplays[0];
          const defaultWindow = nextWindows[0];
          if (defaultDisplay) {
            onSelectionChange({
              target: {
                kind: "display",
                id: defaultDisplay.id,
                name: defaultDisplay.name,
              },
            });
          } else if (defaultWindow) {
            onSelectionChange({
              target: {
                kind: "window",
                id: defaultWindow.id,
                name: defaultWindow.name,
                ownerName: defaultWindow.ownerName,
              },
            });
          }
        }

        if (selection.microphoneId === null) {
          const defaultMicrophone = resolvePreferredMicrophone(
            nextMicrophones,
            selection.microphoneId,
          );
          if (defaultMicrophone) {
            onSelectionChange({ microphoneId: defaultMicrophone.id });
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          onErrorChange?.(getErrorMessage(nextError));
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [
    onErrorChange,
    onRecordingChange,
    onSelectionChange,
    selection.microphoneId,
    selection.target,
    shellReady,
  ]);

  const selectedTarget = resolveTarget(
    selection.target ? `${selection.target.kind}:${selection.target.id}` : "",
    displays,
    windows,
  );
  const canStart = shellReady && selectedTarget !== null && pending === null && recording === null;

  async function run(action: typeof pending, fn: () => Promise<void>) {
    setPending(action);
    onErrorChange?.(null);

    try {
      await fn();
    } catch (nextError) {
      onErrorChange?.(getErrorMessage(nextError));
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

      <div className="controls-grid">
        <label className="field">
          <span>Target</span>
          <select
            disabled={!shellReady || recording !== null}
            value={selection.target ? `${selection.target.kind}:${selection.target.id}` : ""}
            onChange={(event) =>
              onSelectionChange({
                target: resolveTarget(event.target.value, displays, windows),
              })
            }
          >
            <option value="">Select a target</option>
            {displays.map((display) => (
              <option key={`display:${display.id}`} value={`display:${display.id}`}>
                {display.name}
              </option>
            ))}
            {windows.map((window) => (
              <option key={`window:${window.id}`} value={`window:${window.id}`}>
                {window.ownerName} - {window.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Microphone</span>
          <select
            disabled={!shellReady || recording !== null}
            value={selection.microphoneId ?? "none"}
            onChange={(event) =>
              onSelectionChange({
                microphoneId: event.target.value === "none" ? null : event.target.value,
              })
            }
          >
            <option value="none">No microphone</option>
            {microphones.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Countdown</span>
          <input
            disabled={!shellReady || recording !== null}
            type="number"
            min={0}
            max={10}
            value={selection.countdownSeconds}
            onChange={(event) =>
              onSelectionChange({
                countdownSeconds: Number(event.target.value) || 0,
              })
            }
          />
        </label>

        <label className="toggle">
          <input
            checked={selection.captureSystemAudio}
            disabled={!systemAudioSupported || recording !== null}
            type="checkbox"
            onChange={(event) =>
              onSelectionChange({
                captureSystemAudio: event.target.checked,
              })
            }
          />
          <span>
            System audio
            <small>{systemAudioSupported ? "Supported on this platform" : "Unavailable here"}</small>
          </span>
        </label>
      </div>

      <div className="button-row">
        <button
          className="button button-primary"
          disabled={!canStart}
          onClick={() =>
            run("start", async () => {
              const started = await startRecording({
                target: selectedTarget!,
                microphoneName: selection.microphoneId,
                captureSystemAudio: selection.captureSystemAudio,
                countdownSeconds: selection.countdownSeconds,
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown recorder error";
}

function formatMaybeNumber(value: number | null) {
  return value === null ? "unknown" : value.toFixed(value > 10 ? 0 : 1);
}
