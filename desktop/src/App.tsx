import { useAuth, useUser } from "@clerk/clerk-react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { RecorderControls } from "./components/RecorderControls";
import { deriveAppLifecycleState } from "./state/app-state";
import {
  createRecorderState,
  resolvePreferredProject,
  type RecorderSelection,
  type UploadProject,
} from "./state/recorder-state";
import {
  updateUserDefaults,
  usePersistentUserDefaults,
} from "./state/settings-state";
import {
  completeUploadAction,
  failUploadAction,
  prepareUploadAction,
  startUploadFlow,
  type UploadFlowController,
} from "./lib/uploadFlow";
import { checkPermissions, type PermissionSnapshot } from "./lib/tauri";
import { LoginRoute } from "./routes/login";
import { UploadingRoute } from "./routes/uploading";

type DesktopRoute = "recorder" | "uploading";

const RECORDER_PATH = "/";
const UPLOADING_PATH = "/uploading";
const RUNNING_UPLOAD_STEPS = new Set([
  "preparing",
  "uploading",
  "cancelling",
  "finalizing",
]);

export function App() {
  const { isLoaded, isSignedIn } = useAuth();
  const [route, setRoute] = useState<DesktopRoute>(() => readRoute());
  const appState = deriveAppLifecycleState({
    authLoaded: isLoaded,
    isSignedIn: Boolean(isSignedIn),
    permissions: null,
    recording: null,
    upload: null,
    completion: null,
    error: null,
  });

  return (
    <>
      <GlobalStyles />
      <div className="app-shell">
        <div className="hero-glow hero-glow-left" />
        <div className="hero-glow hero-glow-right" />
        {appState === "booting" ? <BootScreen /> : null}
        {appState === "authRequired" ? <LoginRoute /> : null}
        {appState !== "booting" && appState !== "authRequired" ? (
          <RecorderShell route={route} setRoute={setRoute} />
        ) : null}
      </div>
    </>
  );
}

function BootScreen() {
  return (
    <main className="layout boot-layout">
      <section className="panel panel-primary">
        <p className="eyebrow">desktop boot</p>
        <h1>Connecting Clerk and Convex</h1>
        <p className="lede">
          The renderer waits for the shared Loam session before exposing any
          recording UI.
        </p>
      </section>
    </main>
  );
}

function RecorderShell({
  route,
  setRoute,
}: {
  route: DesktopRoute;
  setRoute: (route: DesktopRoute) => void;
}) {
  const { user } = useUser();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const userDefaults = usePersistentUserDefaults();
  const uploadTargets = useQuery(
    api.projects.listUploadTargets,
    isAuthenticated ? {} : "skip",
  );
  const prepareUpload = useAction(prepareUploadAction);
  const completeUpload = useAction(completeUploadAction);
  const failUpload = useAction(failUploadAction);
  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null);
  const [recorderState, setRecorderState] = useState(() =>
    createRecorderState({
      projectId: null,
      target: null,
      microphoneId: userDefaults.lastMicrophoneId,
      countdownSeconds: userDefaults.countdownSeconds,
      captureSystemAudio: userDefaults.captureSystemAudio,
    }),
  );
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const uploadControllerRef = useRef<UploadFlowController | null>(null);

  const selectedProject = resolvePreferredProject(
    uploadTargets as UploadProject[] | undefined,
    userDefaults.lastProjectId,
  );
  const navigationLocked =
    recorderState.upload !== null && RUNNING_UPLOAD_STEPS.has(recorderState.upload.step);
  const appState = deriveAppLifecycleState({
    authLoaded: !isLoading,
    isSignedIn: isAuthenticated,
    permissions,
    recording: recorderState.recording,
    upload: recorderState.upload,
    completion: recorderState.completion,
    error: recorderState.error,
  });

  const authStatus = isLoading
    ? "Exchanging Clerk session for a Convex token"
    : isAuthenticated
      ? "Authenticated"
      : "Waiting for auth";

  useEffect(() => {
    if (!isAuthenticated) {
      setPermissions(null);
      return;
    }

    let cancelled = false;

    void checkPermissions(true)
      .then((snapshot) => {
        if (!cancelled) {
          setPermissions(snapshot);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRecorderState((current) => ({
            ...current,
            error: getErrorMessage(error),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setRecorderState((current) => {
      if (current.selection.projectId === selectedProject.projectId) {
        return current;
      }

      return {
        ...current,
        selection: {
          ...current.selection,
          projectId: selectedProject.projectId,
        },
      };
    });

    if (userDefaults.lastProjectId !== selectedProject.projectId) {
      updateUserDefaults({ lastProjectId: selectedProject.projectId });
    }
  }, [selectedProject, userDefaults.lastProjectId]);

  useEffect(() => {
    const handlePopState = () => {
      if (navigationLocked) {
        navigateTo("uploading", setRoute, true);
        return;
      }

      setRoute(readRoute());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigationLocked, setRoute]);

  async function handleBeginUpload() {
    if (!recorderState.lastStopped || !selectedProject || uploadControllerRef.current) {
      return;
    }

    setUploadMessage(null);
    setRecorderState((current) => ({
      ...current,
      completion: null,
      error: null,
    }));

    const controller = startUploadFlow({
      recording: recorderState.lastStopped,
      projectId: selectedProject.projectId,
      prepareUpload,
      completeUpload,
      failUpload,
      onStateChange: (snapshot) => {
        setRecorderState((current) => ({
          ...current,
          upload: snapshot,
        }));
      },
    });

    uploadControllerRef.current = controller;
    navigateTo("uploading", setRoute);

    const result = await controller.finished;
    uploadControllerRef.current = null;

    if (result.status === "complete") {
      setRecorderState((current) => ({
        ...current,
        lastStopped: null,
        upload: result.snapshot,
        completion: result.completion,
        error: null,
      }));
      setUploadMessage(`Upload finished. Share link ready at ${result.completion.shareUrl}`);
    } else if (result.status === "cancelled") {
      setRecorderState((current) => ({
        ...current,
        upload: result.snapshot,
        error: null,
      }));
      setUploadMessage("Upload cancelled. The local recording is still available for retry.");
    } else {
      setRecorderState((current) => ({
        ...current,
        upload: result.snapshot,
        error: result.error,
      }));
      setUploadMessage(result.error);
    }

    navigateTo("recorder", setRoute, true);
  }

  async function handleCancelUpload() {
    await uploadControllerRef.current?.cancel();
  }

  if (route === "uploading" && recorderState.upload) {
    return (
      <UploadingRoute
        snapshot={recorderState.upload}
        navigationLocked={navigationLocked}
        onCancel={() => {
          void handleCancelUpload();
        }}
      />
    );
  }

  return (
    <main className="layout">
      <section className="panel panel-primary">
        <div className="panel-header">
          <div>
            <p className="eyebrow">renderer auth</p>
            <h1>Loam Desktop Recorder</h1>
          </div>
          <div className="metric">
            <span>Lifecycle</span>
            <strong>{formatLifecycle(appState)}</strong>
          </div>
        </div>

        <p className="lede">
          Clerk stays in the desktop webview and Convex consumes the same
          identity. No Rust-side auth fork is required for the renderer boot
          path.
        </p>

        <div className="status-grid">
          <StatusCard
            label="Signed in as"
            value={user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "Unknown user"}
            detail={user?.id ?? "Missing Clerk user id"}
          />
          <StatusCard
            label="Upload target probe"
            value={
              uploadTargets === undefined
                ? "Loading"
                : `${uploadTargets.length} target${uploadTargets.length === 1 ? "" : "s"}`
            }
            detail="Queried with the authenticated Convex client"
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
            label="Desktop auth fallback"
            value="Not required"
            detail="Defaulting to Clerk in-webview until a concrete incompatibility appears"
          />
        </div>

        <div className="preview">
          <div className="preview-toolbar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="toolbar-label">desktop://recorder</span>
          </div>
          <div className="preview-body">
            <div className="preview-stage">
              <p className="preview-kicker">auth-ready shell</p>
              <h2>Next tasks can assume an authenticated renderer</h2>
              <p>
                Clerk boots first, Convex picks up the token through{" "}
                <code>ConvexProviderWithClerk</code>, and authenticated queries
                are available to the recorder flow.
              </p>
            </div>
            <aside className="preview-side">
              <div className="status-block">
                <span>Current proof</span>
                <strong>
                  <code>projects.listUploadTargets</code> resolves from the
                  renderer.
                </strong>
              </div>
              <div className="status-block muted">
                <span>Fallback boundary</span>
                <strong>
                  <code>desktopAuth.ts</code> keeps any future desktop-specific
                  override isolated.
                </strong>
              </div>
            </aside>
          </div>
        </div>

        <RecorderControls
          shellReady={isAuthenticated}
          selection={recorderState.selection}
          recording={recorderState.recording}
          lastStopped={recorderState.lastStopped}
          error={recorderState.error}
          onSelectionChange={(updates) => {
            setRecorderState((current) => ({
              ...current,
              selection: {
                ...current.selection,
                ...updates,
              } satisfies RecorderSelection,
            }));

            if (updates.microphoneId !== undefined) {
              updateUserDefaults({ lastMicrophoneId: updates.microphoneId });
            }

            if (updates.captureSystemAudio !== undefined) {
              updateUserDefaults({ captureSystemAudio: updates.captureSystemAudio });
            }

            if (updates.countdownSeconds !== undefined) {
              updateUserDefaults({ countdownSeconds: updates.countdownSeconds });
            }
          }}
          onRecordingChange={(recording) => {
            setRecorderState((current) => ({
              ...current,
              recording,
              lastStopped: recording ? null : current.lastStopped,
              error: null,
            }));
          }}
          onStopped={(recording) => {
            setRecorderState((current) => ({
              ...current,
              lastStopped: recording,
              recording: null,
              completion: null,
              error: null,
            }));
            setUploadMessage(null);
          }}
          onErrorChange={(error) => {
            setRecorderState((current) => ({
              ...current,
              error,
            }));
          }}
        />

        {recorderState.lastStopped ? (
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
              The desktop renderer prepares the upload in Convex first, streams
              the local file through Rust, then finalizes the share link in one
              guarded flow.
            </p>
            <div className="status-grid">
              <StatusCard
                label="Copy link"
                value={userDefaults.copyShareLinkAfterUpload ? "Enabled" : "Disabled"}
                detail="Persistent default for the completion flow"
              />
              <StatusCard
                label="Open browser"
                value={userDefaults.openBrowserAfterUpload ? "Enabled" : "Disabled"}
                detail="Persistent default for post-upload behavior"
              />
              <StatusCard
                label="Recorder project"
                value={selectedProject?.projectName ?? "Unavailable"}
                detail={selectedProject?.teamName ?? "No uploadable project"}
              />
            </div>
            <div className="controls-grid">
              <label className="toggle">
                <input
                  checked={userDefaults.copyShareLinkAfterUpload}
                  type="checkbox"
                  onChange={(event) => {
                    updateUserDefaults({
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
                  checked={userDefaults.openBrowserAfterUpload}
                  type="checkbox"
                  onChange={(event) => {
                    updateUserDefaults({
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
                disabled={!selectedProject || uploadTargets === undefined}
                onClick={() => {
                  void handleBeginUpload();
                }}
              >
                Upload latest recording
              </button>
            </div>
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

function readRoute(): DesktopRoute {
  if (typeof window === "undefined") {
    return "recorder";
  }

  return window.location.pathname === UPLOADING_PATH ? "uploading" : "recorder";
}

function navigateTo(
  route: DesktopRoute,
  setRoute: (route: DesktopRoute) => void,
  replace = false,
) {
  const path = route === "uploading" ? UPLOADING_PATH : RECORDER_PATH;
  const currentPath = window.location.pathname;

  if (currentPath !== path) {
    if (replace) {
      window.history.replaceState({ route }, "", path);
    } else {
      window.history.pushState({ route }, "", path);
    }
  }

  setRoute(route);
}

function formatLifecycle(state: ReturnType<typeof deriveAppLifecycleState>) {
  return state.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown desktop error";
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

function GlobalStyles() {
  return (
    <style>{`
      @import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=block");
      @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=block");

      :root {
        color-scheme: light;
        --background: #f0f0e8;
        --surface: rgba(255, 255, 255, 0.82);
        --surface-strong: #1a1a1a;
        --surface-muted: rgba(216, 216, 208, 0.9);
        --foreground: #1a1a1a;
        --foreground-muted: #707268;
        --foreground-inverse: #f0f0e8;
        --border: #1a1a1a;
        --shadow-color: rgba(26, 26, 26, 0.88);
        --accent: #2d5a2d;
        --accent-light: #7cb87c;
        --accent-soft: rgba(124, 184, 124, 0.26);
        --shadow-accent: rgba(45, 90, 45, 0.28);
        font-family: "IBM Plex Sans", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(124, 184, 124, 0.3), transparent 32%),
          radial-gradient(circle at right, rgba(45, 90, 45, 0.14), transparent 28%),
          linear-gradient(180deg, #f4f4ec 0%, #eceadf 100%);
        color: var(--foreground);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body,
      #root {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
      }

      button,
      input {
        font: inherit;
      }

      code {
        font-family: "IBM Plex Mono", monospace;
      }

      .app-shell {
        min-height: 100vh;
        padding: 32px;
        position: relative;
        overflow: hidden;
      }

      .layout {
        position: relative;
        z-index: 1;
        width: min(1180px, 100%);
        margin: 0 auto;
      }

      .boot-layout {
        min-height: calc(100vh - 64px);
        display: flex;
        align-items: center;
      }

      .hero-glow {
        position: absolute;
        border-radius: 999px;
        filter: blur(60px);
        opacity: 0.55;
        pointer-events: none;
      }

      .hero-glow-left {
        inset: -120px auto auto -40px;
        width: 280px;
        height: 280px;
        background: rgba(124, 184, 124, 0.4);
      }

      .hero-glow-right {
        inset: auto -80px 40px auto;
        width: 320px;
        height: 320px;
        background: rgba(45, 90, 45, 0.18);
      }

      .panel {
        border: 2px solid var(--border);
        background: var(--surface);
        box-shadow: 10px 10px 0 0 var(--shadow-color);
        padding: 28px;
        backdrop-filter: blur(16px);
      }

      .panel-primary {
        display: grid;
        gap: 24px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: start;
      }

      .eyebrow,
      .preview-kicker {
        margin: 0 0 8px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1,
      h2 {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        font-size: clamp(2rem, 4vw, 3.2rem);
        line-height: 0.96;
      }

      .lede {
        margin: 0;
        max-width: 60ch;
        color: var(--foreground-muted);
        font-size: 1.05rem;
        line-height: 1.6;
      }

      .metric,
      .status-card,
      .status-block {
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.64);
        padding: 16px;
      }

      .metric span,
      .status-card span,
      .status-block span {
        display: block;
        margin-bottom: 8px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--foreground-muted);
      }

      .metric strong,
      .status-card strong,
      .status-block strong {
        display: block;
        font-size: 1rem;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .status-card p,
      .status-block p {
        margin: 10px 0 0;
        color: var(--foreground-muted);
        line-height: 1.5;
      }

      .preview {
        border: 2px solid var(--border);
        background: rgba(26, 26, 26, 0.93);
        color: var(--foreground-inverse);
        overflow: hidden;
      }

      .preview-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(240, 240, 232, 0.18);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(240, 240, 232, 0.45);
      }

      .toolbar-label {
        margin-left: 6px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        color: rgba(240, 240, 232, 0.68);
      }

      .preview-body {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
      }

      .preview-stage,
      .preview-side {
        padding: 24px;
      }

      .preview-stage p {
        margin: 0;
        max-width: 54ch;
        color: rgba(240, 240, 232, 0.74);
        line-height: 1.6;
      }

      .preview-side {
        border-left: 1px solid rgba(240, 240, 232, 0.18);
        display: grid;
        gap: 12px;
        background: rgba(255, 255, 255, 0.04);
      }

      .status-block {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(240, 240, 232, 0.18);
      }

      .status-block.muted strong {
        color: rgba(240, 240, 232, 0.74);
      }

      .recorder-controls {
        display: grid;
        gap: 18px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.74);
        padding: 24px;
        box-shadow: 10px 10px 0 0 rgba(26, 26, 26, 0.24);
      }

      .controls-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .field,
      .toggle {
        display: grid;
        gap: 8px;
      }

      .field span,
      .toggle span {
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .field select,
      .field input {
        min-height: 48px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.92);
        padding: 0 14px;
      }

      .toggle {
        grid-template-columns: auto 1fr;
        align-items: center;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.92);
        padding: 14px;
      }

      .toggle input {
        width: 18px;
        height: 18px;
      }

      .toggle small {
        display: block;
        margin-top: 4px;
        color: var(--foreground-muted);
        font-family: "IBM Plex Sans", system-ui, sans-serif;
        font-size: 0.9rem;
        font-weight: 400;
        letter-spacing: normal;
        text-transform: none;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .button {
        min-height: 46px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.92);
        padding: 0 18px;
        font-weight: 700;
        cursor: pointer;
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .button-primary {
        background: var(--accent);
        color: var(--foreground-inverse);
      }

      .button-danger {
        background: #9c3026;
        color: var(--foreground-inverse);
      }

      .recording-summary {
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.76);
        padding: 14px;
      }

      .recording-summary.success {
        background: rgba(124, 184, 124, 0.24);
      }

      .recording-summary strong {
        display: block;
        margin-bottom: 6px;
      }

      .recording-summary p,
      .recording-summary code {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .error-copy {
        margin: 0;
        color: #8c1e16;
        font-weight: 700;
      }

      .upload-launcher,
      .upload-progress {
        display: grid;
        gap: 18px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.74);
        padding: 24px;
        box-shadow: 10px 10px 0 0 rgba(26, 26, 26, 0.18);
      }

      .progress-bar {
        height: 16px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.88);
        overflow: hidden;
      }

      .progress-bar span {
        display: block;
        height: 100%;
        background:
          linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%);
        transition: width 180ms ease-out;
      }

      .upload-stats {
        align-items: stretch;
      }

      .upload-message {
        margin: 0;
        border: 2px solid var(--border);
        background: rgba(124, 184, 124, 0.24);
        padding: 16px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .login-shell {
        min-height: calc(100vh - 64px);
        display: grid;
        place-items: center;
      }

      .login-layout {
        width: min(1120px, 100%);
        display: grid;
        grid-template-columns: minmax(320px, 1.1fr) minmax(360px, 420px);
        gap: 24px;
        align-items: start;
      }

      .login-copy {
        display: grid;
        gap: 20px;
      }

      .login-points {
        display: grid;
        gap: 12px;
      }

      .login-point {
        border-left: 4px solid var(--accent);
        padding-left: 14px;
      }

      .login-point strong {
        display: block;
        margin-bottom: 4px;
        font-family: "Space Grotesk", sans-serif;
      }

      .login-point p {
        margin: 0;
        color: var(--foreground-muted);
        line-height: 1.5;
      }

      .login-card {
        display: grid;
        gap: 16px;
        justify-items: center;
      }

      .login-note {
        margin: 0;
        text-align: center;
        color: var(--foreground-muted);
        font-size: 0.95rem;
        line-height: 1.6;
      }

      @media (max-width: 960px) {
        .app-shell {
          padding: 20px;
        }

        .panel-header,
        .login-layout,
        .preview-body,
        .status-grid {
          grid-template-columns: 1fr;
        }

        .controls-grid {
          grid-template-columns: 1fr;
        }

        .preview-side {
          border-left: 0;
          border-top: 1px solid rgba(240, 240, 232, 0.18);
        }
      }
    `}</style>
  );
}
