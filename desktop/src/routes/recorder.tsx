import { CaptureTargetPicker } from "../components/CaptureTargetPicker";
import { MicrophonePicker } from "../components/MicrophonePicker";
import { PermissionGate } from "../components/PermissionGate";
import { ProjectPicker } from "../components/ProjectPicker";
import { RecorderControls } from "../components/RecorderControls";
import type {
  CaptureDisplay,
  CaptureWindow,
  MicrophoneDevice,
  PermissionKind,
  PermissionSnapshot,
  RecordingSnapshot,
  RecordingStopped,
} from "../lib/tauri";
import { MAX_DIRECT_UPLOAD_BYTES } from "../lib/uploadFlow";
import type { RecorderSelection, UploadProject } from "../state/recorder-state";

type RecorderRouteProps = {
  appStateLabel: string;
  authStatus: string;
  signedInValue: string;
  signedInDetail: string;
  permissions: PermissionSnapshot | null;
  permissionActionPending: PermissionKind | null;
  displays: CaptureDisplay[];
  windows: CaptureWindow[];
  microphones: MicrophoneDevice[];
  systemAudioSupported: boolean;
  uploadTargets: UploadProject[] | undefined;
  selectedProject: UploadProject | null;
  selection: RecorderSelection;
  recording: RecordingSnapshot | null;
  lastStopped: RecordingStopped | null;
  error: string | null;
  uploadMessage: string | null;
  copyShareLinkAfterUpload: boolean;
  openBrowserAfterUpload: boolean;
  onRefreshPermissions: () => void;
  onRequestPermission: (permission: PermissionKind) => void;
  onOpenPermissionSettings: (permission: PermissionKind) => void;
  onRefreshDevices: () => void;
  onSelectionChange: (updates: Partial<RecorderSelection>) => void;
  onRecordingChange: (recording: RecordingSnapshot | null) => void;
  onRecoverableError: (errorCode: string) => void;
  onStopped: (recording: RecordingStopped) => void;
  onErrorChange: (error: string | null) => void;
  onUpdatePostUploadDefaults: (updates: {
    copyShareLinkAfterUpload?: boolean;
    openBrowserAfterUpload?: boolean;
  }) => void;
  onBeginUpload: () => void;
};

export function RecorderRoute({
  appStateLabel,
  authStatus,
  signedInValue,
  signedInDetail,
  permissions,
  permissionActionPending,
  displays,
  windows,
  microphones,
  systemAudioSupported,
  uploadTargets,
  selectedProject,
  selection,
  recording,
  lastStopped,
  error,
  uploadMessage,
  copyShareLinkAfterUpload,
  openBrowserAfterUpload,
  onRefreshPermissions,
  onRequestPermission,
  onOpenPermissionSettings,
  onRefreshDevices,
  onSelectionChange,
  onRecordingChange,
  onRecoverableError,
  onStopped,
  onErrorChange,
  onUpdatePostUploadDefaults,
  onBeginUpload,
}: RecorderRouteProps) {
  const screenReady =
    permissions?.screen === "granted" || permissions?.screen === "notNeeded";
  const setupReady = screenReady && selection.target && selectedProject;
  const fileTooLarge =
    lastStopped?.fileSizeBytes !== null &&
    lastStopped?.fileSizeBytes !== undefined &&
    lastStopped.fileSizeBytes > MAX_DIRECT_UPLOAD_BYTES;

  return (
    <main className="layout">
      <section className="panel panel-primary">
        <div className="panel-header">
          <div>
            <p className="eyebrow">desktop://recorder</p>
            <h1>Loam Desktop Recorder</h1>
          </div>
          <div className="metric">
            <span>Lifecycle</span>
            <strong>{appStateLabel}</strong>
          </div>
        </div>

        <p className="lede">
          Stay on one screen: clear permissions, choose a target, keep a sensible
          microphone default, and point the upload at the right Loam project before
          recording starts.
        </p>

        <div className="status-grid">
          <StatusCard
            label="Signed in as"
            value={signedInValue}
            detail={signedInDetail}
          />
          <StatusCard
            label="Permission snapshot"
            value={
              permissions
                ? `screen ${permissions.screen} / mic ${permissions.microphone}`
                : "Pending"
            }
            detail={authStatus}
          />
          <StatusCard
            label="Upload projects"
            value={
              uploadTargets === undefined
                ? "Loading"
                : `${uploadTargets.length} target${uploadTargets.length === 1 ? "" : "s"}`
            }
            detail="Queried with the authenticated Convex client"
          />
        </div>

        <PermissionGate
          permissions={permissions}
          busyPermission={permissionActionPending}
          onOpenSettings={onOpenPermissionSettings}
          onRefresh={onRefreshPermissions}
          onRequestPermission={onRequestPermission}
        />

        <div className="setup-grid">
          <CaptureTargetPicker
            disabled={!screenReady || recording !== null}
            displays={displays}
            onRefresh={onRefreshDevices}
            onSelect={(target) => {
              onSelectionChange({ target });
            }}
            selectedTarget={selection.target}
            windows={windows}
          />

          <ProjectPicker
            disabled={recording !== null}
            onSelect={(projectId) => {
              onSelectionChange({ projectId });
            }}
            projects={uploadTargets}
            selectedProjectId={selection.projectId}
          />
        </div>

        <div className="setup-grid">
          <MicrophonePicker
            disabled={recording !== null}
            microphonePermission={permissions?.microphone ?? "empty"}
            microphones={microphones}
            onRefresh={onRefreshDevices}
            onSelect={(microphoneId) => {
              onSelectionChange({ microphoneId });
            }}
            selectedMicrophoneId={selection.microphoneId}
          />

          <section className="setup-section">
            <div className="setup-section-header">
              <div>
                <p className="eyebrow">record defaults</p>
                <h2>Keep the start action frictionless</h2>
              </div>
            </div>

            <div className="controls-grid">
              <label className="field">
                <span>Countdown</span>
                <input
                  disabled={recording !== null}
                  max={10}
                  min={0}
                  type="number"
                  value={selection.countdownSeconds}
                  onChange={(event) => {
                    onSelectionChange({
                      countdownSeconds: Number(event.target.value) || 0,
                    });
                  }}
                />
              </label>

              <label className="toggle">
                <input
                  checked={selection.captureSystemAudio}
                  disabled={!systemAudioSupported || recording !== null}
                  type="checkbox"
                  onChange={(event) => {
                    onSelectionChange({
                      captureSystemAudio: event.target.checked,
                    });
                  }}
                />
                <span>
                  System audio
                  <small>
                    {systemAudioSupported
                      ? "Supported on this platform"
                      : "Unavailable on this platform"}
                  </small>
                </span>
              </label>
            </div>

            <p className="support-copy">
              {setupReady
                ? "The next click can start a valid recording immediately."
                : "Screen permission, one capture target, and one upload project are required before recording starts."}
            </p>
          </section>
        </div>

        <RecorderControls
          captureSystemAudio={selection.captureSystemAudio}
          countdownSeconds={selection.countdownSeconds}
          error={error}
          lastStopped={lastStopped}
          microphoneId={selection.microphoneId}
          microphones={microphones}
          onErrorChange={onErrorChange}
          onRecoverableError={onRecoverableError}
          onRecordingChange={onRecordingChange}
          onStopped={onStopped}
          recording={recording}
          selectedProjectName={selectedProject?.projectName ?? null}
          systemAudioSupported={systemAudioSupported}
          target={selection.target}
        />

        {lastStopped ? (
          <section className="upload-launcher">
            <div className="panel-header">
              <div>
                <p className="eyebrow">renderer upload</p>
                <h2>Send the latest recording to Loam</h2>
              </div>
              <div className="metric">
                <span>Default project</span>
                <strong>
                  {selectedProject
                    ? `${selectedProject.teamName} / ${selectedProject.projectName}`
                    : "Unavailable"}
                </strong>
              </div>
            </div>
            <p className="lede">
              The native file stays local until the renderer prepares the upload in
              Convex and then hands the presigned URL to Rust.
            </p>
            <div className="status-grid">
              <StatusCard
                label="Copy link"
                value={copyShareLinkAfterUpload ? "Enabled" : "Disabled"}
                detail="Persistent default for the completion flow"
              />
              <StatusCard
                label="Open browser"
                value={openBrowserAfterUpload ? "Enabled" : "Disabled"}
                detail="Persistent default for post-upload behavior"
              />
              <StatusCard
                label="Recorder project"
                value={selectedProject?.projectName ?? "Unavailable"}
                detail={selectedProject?.teamName ?? "No uploadable project"}
              />
              <StatusCard
                label="File size"
                value={
                  lastStopped.fileSizeBytes === null
                    ? "Unknown"
                    : formatBytes(lastStopped.fileSizeBytes)
                }
                detail={
                  fileTooLarge
                    ? "Direct upload is blocked above 5 GiB."
                    : "Direct upload stays within Loam's 5 GiB limit."
                }
              />
            </div>
            <div className="controls-grid">
              <label className="toggle">
                <input
                  checked={copyShareLinkAfterUpload}
                  type="checkbox"
                  onChange={(event) => {
                    onUpdatePostUploadDefaults({
                      copyShareLinkAfterUpload: event.target.checked,
                    });
                  }}
                />
                <span>
                  Copy share link after upload
                  <small>Stored as the default completion action</small>
                </span>
              </label>
              <label className="toggle">
                <input
                  checked={openBrowserAfterUpload}
                  type="checkbox"
                  onChange={(event) => {
                    onUpdatePostUploadDefaults({
                      openBrowserAfterUpload: event.target.checked,
                    });
                  }}
                />
                <span>
                  Open browser after upload
                  <small>Stored for the completion route</small>
                </span>
              </label>
            </div>
            <div className="button-row">
              <button
                className="button button-primary"
                disabled={!selectedProject || uploadTargets === undefined || fileTooLarge}
                type="button"
                onClick={onBeginUpload}
              >
                Upload latest recording
              </button>
            </div>
            {fileTooLarge ? (
              <p className="error-copy">
                This recording is too large for Loam&apos;s current 5 GiB direct-upload
                limit. Keep the local file or record a shorter clip before retrying.
              </p>
            ) : null}
            {!selectedProject && uploadTargets !== undefined ? (
              <p className="error-copy">
                No uploadable Loam project is available for this account.
              </p>
            ) : null}
          </section>
        ) : null}

        {uploadMessage ? <p className="upload-message">{uploadMessage}</p> : null}
      </section>
    </main>
  );
}

function formatBytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function StatusCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="status-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
