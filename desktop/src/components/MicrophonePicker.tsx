import type { MicrophoneDevice, PermissionStatus } from "../lib/tauri";

type MicrophonePickerProps = {
  microphones: MicrophoneDevice[];
  selectedMicrophoneId: string | null;
  microphonePermission: PermissionStatus;
  disabled?: boolean;
  onSelect: (microphoneId: string | null) => void;
  onRefresh: () => void;
};

export function MicrophonePicker({
  microphones,
  selectedMicrophoneId,
  microphonePermission,
  disabled = false,
  onSelect,
  onRefresh,
}: MicrophonePickerProps) {
  const microphoneAvailable =
    microphonePermission === "granted" || microphonePermission === "notNeeded";

  return (
    <section className="setup-section">
      <div className="setup-section-header">
        <div>
          <p className="eyebrow">microphone</p>
          <h2>Choose voice capture or leave it off</h2>
        </div>
        <button className="button" disabled={disabled} type="button" onClick={onRefresh}>
          Refresh devices
        </button>
      </div>

      <div className="choice-grid choice-grid-compact">
        <button
          className={`choice-card${selectedMicrophoneId === null ? " is-selected" : ""}`}
          disabled={disabled}
          type="button"
          onClick={() => {
            onSelect(null);
          }}
        >
          <strong>No microphone</strong>
          <span>Record the target without voice input.</span>
        </button>

        {microphones.map((device) => (
          <button
            key={device.id}
            className={`choice-card${selectedMicrophoneId === device.id ? " is-selected" : ""}`}
            disabled={disabled || !microphoneAvailable}
            type="button"
            onClick={() => {
              onSelect(device.id);
            }}
          >
            <strong>{device.name}</strong>
            <span>{device.isDefault ? "System default" : "Available input"}</span>
          </button>
        ))}
      </div>

      <p className="support-copy">
        {!microphoneAvailable
          ? "Microphone permission is not available yet. Recording can still proceed without it."
          : microphones.length > 0
            ? "Your previous microphone stays selected when it is still available."
            : "No microphones are currently available. The recorder will proceed without one."}
      </p>
    </section>
  );
}
