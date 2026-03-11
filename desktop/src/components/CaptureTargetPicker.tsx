import type { CaptureDisplay, CaptureTarget, CaptureWindow } from "../lib/tauri";
import { buildTargetKey } from "../state/recorder-state";

type CaptureTargetPickerProps = {
  displays: CaptureDisplay[];
  windows: CaptureWindow[];
  selectedTarget: CaptureTarget | null;
  disabled?: boolean;
  onSelect: (target: CaptureTarget) => void;
  onRefresh: () => void;
};

export function CaptureTargetPicker({
  displays,
  windows,
  selectedTarget,
  disabled = false,
  onSelect,
  onRefresh,
}: CaptureTargetPickerProps) {
  const selectedKey = buildTargetKey(selectedTarget);
  const hasTargets = displays.length > 0 || windows.length > 0;

  return (
    <section className="setup-section">
      <div className="setup-section-header">
        <div>
          <p className="eyebrow">capture target</p>
          <h2>Pick what the recording should follow</h2>
        </div>
        <button className="button" disabled={disabled} type="button" onClick={onRefresh}>
          Refresh targets
        </button>
      </div>

      {!hasTargets ? (
        <p className="support-copy">
          No displays or windows are available yet. Refresh after screen permission is granted.
        </p>
      ) : null}

      {displays.length > 0 ? (
        <div className="picker-group">
          <div className="picker-label-row">
            <span className="picker-label">Displays</span>
          </div>
          <div className="choice-grid">
            {displays.map((display) => {
              const target: CaptureTarget = {
                kind: "display",
                id: display.id,
                name: display.name,
              };

              return (
                <button
                  key={`display:${display.id}`}
                  className={`choice-card${selectedKey === buildTargetKey(target) ? " is-selected" : ""}`}
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    onSelect(target);
                  }}
                >
                  <strong>{display.name}</strong>
                  <span>
                    {display.width} x {display.height}
                    {display.isPrimary ? " • Primary" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {windows.length > 0 ? (
        <div className="picker-group">
          <div className="picker-label-row">
            <span className="picker-label">Windows</span>
          </div>
          <div className="choice-grid">
            {windows.map((window) => {
              const target: CaptureTarget = {
                kind: "window",
                id: window.id,
                name: window.name,
                ownerName: window.ownerName,
              };

              return (
                <button
                  key={`window:${window.id}`}
                  className={`choice-card${selectedKey === buildTargetKey(target) ? " is-selected" : ""}`}
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    onSelect(target);
                  }}
                >
                  <strong>{window.name}</strong>
                  <span>{window.ownerName}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
