import { useEffect, useState } from "react";
import type {
  CaptureDisplay,
  CaptureTarget,
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

type ControlsProps = {
  shellReady: boolean;
};

export function RecorderControls({ shellReady }: ControlsProps) {
  const [displays, setDisplays] = useState<CaptureDisplay[]>([]);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("none");
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [recording, setRecording] = useState<RecordingSnapshot | null>(null);
  const [lastStopped, setLastStopped] = useState<RecordingStopped | null>(null);
  const [systemAudioSupported, setSystemAudioSupported] = useState(false);
  const [pending, setPending] = useState<"start" | "pause" | "resume" | "stop" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setRecording(current);
        setSystemAudioSupported(supportsSystemAudio);

        if (!selectedTargetKey) {
          const defaultDisplay = nextDisplays[0];
          const defaultWindow = nextWindows[0];
          if (defaultDisplay) {
            setSelectedTargetKey(`display:${defaultDisplay.id}`);
          } else if (defaultWindow) {
            setSelectedTargetKey(`window:${defaultWindow.id}`);
          }
        }

        if (selectedMicrophoneId === "none") {
          const defaultMicrophone = nextMicrophones.find((device) => device.isDefault);
          if (defaultMicrophone) {
            setSelectedMicrophoneId(defaultMicrophone.id);
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(getErrorMessage(nextError));
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [selectedMicrophoneId, selectedTargetKey, shellReady]);

  const selectedTarget = resolveTarget(selectedTargetKey, displays, windows);
  const canStart = shellReady && selectedTarget !== null && pending === null && recording === null;

  async function run(action: typeof pending, fn: () => Promise<void>) {
    setPending(action);
    setError(null);

    try {
      await fn();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
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
            value={selectedTargetKey}
            onChange={(event) => setSelectedTargetKey(event.target.value)}
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
            value={selectedMicrophoneId}
            onChange={(event) => setSelectedMicrophoneId(event.target.value)}
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
            value={countdownSeconds}
            onChange={(event) => setCountdownSeconds(Number(event.target.value) || 0)}
          />
        </label>

        <label className="toggle">
          <input
            checked={captureSystemAudio}
            disabled={!systemAudioSupported || recording !== null}
            type="checkbox"
            onChange={(event) => setCaptureSystemAudio(event.target.checked)}
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
                microphoneName:
                  selectedMicrophoneId === "none" ? null : selectedMicrophoneId,
                captureSystemAudio,
                countdownSeconds,
              });
              setRecording(started);
              setLastStopped(null);
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
              setRecording(await pauseRecording());
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
              setRecording(await resumeRecording());
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
              setLastStopped(stopped);
              setRecording(null);
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
              setRecording(null);
              setLastStopped(null);
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

function resolveTarget(
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown recorder error";
}

function formatMaybeNumber(value: number | null) {
  return value === null ? "unknown" : value.toFixed(value > 10 ? 0 : 1);
}
