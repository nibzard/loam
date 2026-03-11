import { useAuth, useUser } from "@clerk/clerk-react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  completeUploadAction,
  failUploadAction,
  prepareUploadAction,
  startUploadFlow,
  type UploadFlowController,
} from "./lib/uploadFlow";
import {
  checkPermissions,
  describeDesktopError,
  getCurrentRecording,
  isSystemAudioSupported,
  listCaptureDisplays,
  listCaptureWindows,
  listMicrophones,
  openPermissionSettings,
  requestPermission,
  type CaptureDisplay,
  type CaptureWindow,
  type MicrophoneDevice,
  type PermissionKind,
  type PermissionSnapshot,
} from "./lib/tauri";
import { navigateTo, readRoute, type DesktopRoute } from "./lib/routes";
import { CompleteRoute } from "./routes/complete";
import { LoginRoute } from "./routes/login";
import { RecorderRoute } from "./routes/recorder";
import { UploadingRoute } from "./routes/uploading";
import { deriveAppLifecycleState } from "./state/app-state";
import {
  resolveTarget,
  createRecorderState,
  resolvePreferredMicrophone,
  resolvePreferredProject,
  type RecorderSelection,
  type UploadProject,
} from "./state/recorder-state";
import {
  updateUserDefaults,
  usePersistentUserDefaults,
} from "./state/settings-state";

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
  const [displays, setDisplays] = useState<CaptureDisplay[]>([]);
  const [windows, setWindows] = useState<CaptureWindow[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [systemAudioSupported, setSystemAudioSupported] = useState(false);
  const [permissionActionPending, setPermissionActionPending] =
    useState<PermissionKind | null>(null);
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

  async function refreshPermissions(initialCheck = false) {
    const snapshot = await checkPermissions(initialCheck);
    setPermissions(snapshot);
    return snapshot;
  }

  async function refreshDevices() {
    const [nextDisplays, nextWindows, nextMicrophones, current, supportsSystemAudio] =
      await Promise.all([
        listCaptureDisplays(),
        listCaptureWindows(),
        listMicrophones(),
        getCurrentRecording(),
        isSystemAudioSupported(),
      ]);

    setDisplays(nextDisplays);
    setWindows(nextWindows);
    setMicrophones(nextMicrophones);
    setSystemAudioSupported(supportsSystemAudio);

    setRecorderState((currentState) => {
      let nextSelection = currentState.selection;
      let nextError = currentState.error;

      const resolvedSelectedTarget = resolveTarget(
        nextSelection.target
          ? `${nextSelection.target.kind}:${nextSelection.target.id}`
          : "",
        nextDisplays,
        nextWindows,
      );

      if (resolvedSelectedTarget) {
        nextSelection = {
          ...nextSelection,
          target: resolvedSelectedTarget,
        };
      } else if (nextSelection.target && currentState.recording === null) {
        const defaultDisplay = nextDisplays[0];
        const defaultWindow = nextWindows[0];

        nextSelection = {
          ...nextSelection,
          target: defaultDisplay
            ? {
                kind: "display",
                id: defaultDisplay.id,
                name: defaultDisplay.name,
              }
            : defaultWindow
              ? {
                  kind: "window",
                  id: defaultWindow.id,
                  name: defaultWindow.name,
                  ownerName: defaultWindow.ownerName,
                }
              : null,
        };
        nextError = nextSelection.target
          ? "The previous capture target disappeared. Loam selected the next available target so you can retry immediately."
          : "The previous capture target disappeared and no replacement target is available yet.";
      } else if (!nextSelection.target) {
        const defaultDisplay = nextDisplays[0];
        const defaultWindow = nextWindows[0];

        if (defaultDisplay) {
          nextSelection = {
            ...nextSelection,
            target: {
              kind: "display",
              id: defaultDisplay.id,
              name: defaultDisplay.name,
            },
          };
        } else if (defaultWindow) {
          nextSelection = {
            ...nextSelection,
            target: {
              kind: "window",
              id: defaultWindow.id,
              name: defaultWindow.name,
              ownerName: defaultWindow.ownerName,
            },
          };
        }
      }

      const preferredMicrophone = resolvePreferredMicrophone(
        nextMicrophones,
        currentState.selection.microphoneId,
      );

      if (
        currentState.selection.microphoneId !== null &&
        !nextMicrophones.some((device) => device.id === currentState.selection.microphoneId)
      ) {
        nextSelection = {
          ...nextSelection,
          microphoneId: preferredMicrophone?.id ?? null,
        };
        nextError = preferredMicrophone
          ? `The previous microphone disappeared. Loam switched to ${preferredMicrophone.name}.`
          : "The previous microphone disappeared. Recording will continue with the microphone turned off.";
      } else if (currentState.selection.microphoneId === null && preferredMicrophone) {
        nextSelection = {
          ...nextSelection,
          microphoneId: preferredMicrophone.id,
        };
      }

      return {
        ...currentState,
        recording: currentState.recording ?? current,
        error: nextError,
        selection: nextSelection,
      };
    });
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setPermissions(null);
      setDisplays([]);
      setWindows([]);
      setMicrophones([]);
      setSystemAudioSupported(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await checkPermissions(true);
        if (cancelled) {
          return;
        }

        setPermissions(snapshot);

        await refreshDevices();
      } catch (error: unknown) {
        if (!cancelled) {
          setRecorderState((current) => ({
            ...current,
            error: describeDesktopError(error).message,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let refreshInFlight = false;

    const syncEnvironment = () => {
      if (document.visibilityState === "hidden" || refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      void (async () => {
        try {
          await refreshPermissions();
          await refreshDevices();
        } catch (error) {
          setRecorderState((current) => ({
            ...current,
            error: describeDesktopError(error).message,
          }));
        } finally {
          refreshInFlight = false;
        }
      })();
    };

    window.addEventListener("focus", syncEnvironment);
    document.addEventListener("visibilitychange", syncEnvironment);

    return () => {
      window.removeEventListener("focus", syncEnvironment);
      document.removeEventListener("visibilitychange", syncEnvironment);
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
      setUploadMessage(null);
      navigateTo("complete", setRoute, true);
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
      navigateTo("recorder", setRoute, true);
    }
  }

  async function handleCancelUpload() {
    await uploadControllerRef.current?.cancel();
  }

  async function handleRefreshPermissions() {
    try {
      await refreshPermissions();
      setRecorderState((current) => ({ ...current, error: null }));
    } catch (error) {
      setRecorderState((current) => ({
        ...current,
        error: describeDesktopError(error).message,
      }));
    }
  }

  async function handleRequestPermission(permission: PermissionKind) {
    setPermissionActionPending(permission);

    try {
      await requestPermission(permission);
      await refreshPermissions();
      await refreshDevices();
      setRecorderState((current) => ({ ...current, error: null }));
    } catch (error) {
      setRecorderState((current) => ({
        ...current,
        error: describeDesktopError(error).message,
      }));
    } finally {
      setPermissionActionPending(null);
    }
  }

  async function handleOpenPermissionSettings(permission: PermissionKind) {
    try {
      await openPermissionSettings(permission);
      setRecorderState((current) => ({ ...current, error: null }));
    } catch (error) {
      setRecorderState((current) => ({
        ...current,
        error: describeDesktopError(error).message,
      }));
    }
  }

  async function handleRefreshDevices() {
    try {
      await refreshDevices();
      setRecorderState((current) => ({ ...current, error: null }));
    } catch (error) {
      setRecorderState((current) => ({
        ...current,
        error: describeDesktopError(error).message,
      }));
    }
  }

  async function handleRecoverableRecorderError(errorCode: string) {
    try {
      if (
        errorCode === "MissingScreenPermission" ||
        errorCode === "MissingMicrophonePermission"
      ) {
        await refreshPermissions();
      }

      if (
        errorCode === "MissingScreenPermission" ||
        errorCode === "MissingMicrophonePermission" ||
        errorCode === "MicrophoneNotFound" ||
        errorCode === "TargetNotFound"
      ) {
        await refreshDevices();
      }
    } catch (error) {
      setRecorderState((current) => ({
        ...current,
        error: describeDesktopError(error).message,
      }));
    }
  }

  if (route === "uploading" && recorderState.upload) {
    return (
      <UploadingRoute
        snapshot={recorderState.upload}
        navigationLocked={navigationLocked}
        onCancel={() => {
          return handleCancelUpload();
        }}
      />
    );
  }

  if (route === "complete" && recorderState.completion) {
    return (
      <CompleteRoute
        completion={recorderState.completion}
        snapshot={recorderState.upload}
        copyShareLinkByDefault={userDefaults.copyShareLinkAfterUpload}
        openBrowserByDefault={userDefaults.openBrowserAfterUpload}
        onReturnToRecorder={() => {
          setRecorderState((current) => ({
            ...current,
            completion: null,
            upload: null,
            error: null,
          }));
          setUploadMessage(null);
          navigateTo("recorder", setRoute, true);
        }}
      />
    );
  }

  return (
    <RecorderRoute
      appStateLabel={formatLifecycle(appState)}
      authStatus={authStatus}
      copyShareLinkAfterUpload={userDefaults.copyShareLinkAfterUpload}
      displays={displays}
      error={recorderState.error}
      lastStopped={recorderState.lastStopped}
      microphones={microphones}
      onBeginUpload={() => {
        void handleBeginUpload();
      }}
      onErrorChange={(error) => {
        setRecorderState((current) => ({
          ...current,
          error,
        }));
      }}
      onOpenPermissionSettings={(permission) => {
        void handleOpenPermissionSettings(permission);
      }}
      onRecordingChange={(recording) => {
        setRecorderState((current) => ({
          ...current,
          recording,
          lastStopped: recording ? null : current.lastStopped,
          error: null,
        }));
      }}
      onRefreshDevices={() => {
        void handleRefreshDevices();
      }}
      onRefreshPermissions={() => {
        void handleRefreshPermissions();
      }}
      onRequestPermission={(permission) => {
        void handleRequestPermission(permission);
      }}
      onRecoverableError={(errorCode) => {
        void handleRecoverableRecorderError(errorCode);
      }}
      onSelectionChange={(updates) => {
        setRecorderState((current) => ({
          ...current,
          selection: {
            ...current.selection,
            ...updates,
          } satisfies RecorderSelection,
        }));

        if (updates.projectId !== undefined) {
          updateUserDefaults({ lastProjectId: updates.projectId });
        }

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
      onUpdatePostUploadDefaults={(updates) => {
        updateUserDefaults(updates);
      }}
      openBrowserAfterUpload={userDefaults.openBrowserAfterUpload}
      permissionActionPending={permissionActionPending}
      permissions={permissions}
      recording={recorderState.recording}
      selectedProject={selectedProject}
      selection={recorderState.selection}
      signedInDetail={user?.id ?? "Missing Clerk user id"}
      signedInValue={user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "Unknown user"}
      systemAudioSupported={systemAudioSupported}
      uploadMessage={uploadMessage}
      uploadTargets={uploadTargets as UploadProject[] | undefined}
      windows={windows}
    />
  );
}

function formatLifecycle(state: ReturnType<typeof deriveAppLifecycleState>) {
  return state.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
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

      .panel-header,
      .setup-section-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: start;
      }

      .eyebrow,
      .picker-label,
      .permission-label {
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
      .status-card {
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.64);
        padding: 16px;
      }

      .metric span,
      .status-card span {
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
      .status-card strong {
        display: block;
        font-size: 1rem;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .status-card p {
        margin: 10px 0 0;
        color: var(--foreground-muted);
        line-height: 1.5;
      }

      .setup-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
        gap: 16px;
      }

      .setup-section,
      .recorder-controls,
      .upload-launcher,
      .upload-progress {
        display: grid;
        gap: 18px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.74);
        padding: 24px;
        box-shadow: 10px 10px 0 0 rgba(26, 26, 26, 0.18);
      }

      .permission-grid,
      .choice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .choice-grid-compact {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .picker-group {
        display: grid;
        gap: 12px;
      }

      .picker-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .choice-card,
      .permission-card {
        display: grid;
        gap: 8px;
        width: 100%;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.92);
        padding: 16px;
        text-align: left;
      }

      .choice-card {
        cursor: pointer;
      }

      .choice-card strong,
      .permission-card strong {
        font-size: 1rem;
      }

      .choice-card span,
      .permission-card p,
      .support-copy {
        margin: 0;
        color: var(--foreground-muted);
        line-height: 1.5;
      }

      .choice-card.is-selected,
      .permission-card.is-ready {
        border-color: var(--accent);
        background: rgba(124, 184, 124, 0.18);
      }

      .permission-card-header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }

      .permission-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 10px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.9);
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .permission-granted,
      .permission-notNeeded {
        border-color: var(--accent);
        color: var(--accent);
      }

      .permission-denied {
        color: #8c1e16;
      }

      .permission-empty {
        color: #8b5b00;
      }

      .support-copy {
        font-size: 0.95rem;
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
        color: inherit;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
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

      .button-secondary {
        background: rgba(124, 184, 124, 0.18);
      }

      .button-link {
        appearance: none;
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

      .completion-card {
        display: grid;
        gap: 18px;
        border: 2px solid var(--border);
        background: rgba(255, 255, 255, 0.78);
        padding: 24px;
        box-shadow: 10px 10px 0 0 rgba(26, 26, 26, 0.18);
      }

      .completion-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: start;
      }

      .share-link-row {
        border: 2px solid var(--border);
        background: rgba(124, 184, 124, 0.18);
        padding: 16px;
        overflow-x: auto;
      }

      .share-link-row code {
        display: block;
        overflow-wrap: anywhere;
      }

      .completion-copy-state {
        font-weight: 700;
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
        .setup-section-header,
        .login-layout,
        .setup-grid,
        .permission-grid,
        .status-grid {
          grid-template-columns: 1fr;
        }

        .controls-grid,
        .choice-grid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
