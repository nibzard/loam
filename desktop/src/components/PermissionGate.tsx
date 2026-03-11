import type { PermissionKind, PermissionSnapshot, PermissionStatus } from "../lib/tauri";

type PermissionGateProps = {
  permissions: PermissionSnapshot | null;
  busyPermission: PermissionKind | null;
  onRequestPermission: (permission: PermissionKind) => void;
  onOpenSettings: (permission: PermissionKind) => void;
  onRefresh: () => void;
};

export function PermissionGate({
  permissions,
  busyPermission,
  onRequestPermission,
  onOpenSettings,
  onRefresh,
}: PermissionGateProps) {
  if (!permissions) {
    return (
      <section className="setup-section">
        <div className="setup-section-header">
          <div>
            <p className="eyebrow">permission gate</p>
            <h2>Checking system access</h2>
          </div>
        </div>
        <p className="lede">
          Loam checks screen and microphone status before exposing the recording request.
        </p>
      </section>
    );
  }

  const screenReady = isPermitted(permissions.screen);
  const microphoneReady = isPermitted(permissions.microphone);

  return (
    <section className="setup-section">
      <div className="setup-section-header">
        <div>
          <p className="eyebrow">permission gate</p>
          <h2>Unlock capture once, then stay fast</h2>
        </div>
        <button className="button" type="button" onClick={onRefresh}>
          Refresh permissions
        </button>
      </div>

      <div className="permission-grid">
        <PermissionCard
          actionLabel={screenReady ? "Screen access ready" : "Grant screen access"}
          busy={busyPermission === "screen"}
          detail={
            screenReady
              ? "Required access is already available for display and window capture."
              : "Screen capture is required before Loam can list displays or windows."
          }
          permission="screen"
          status={permissions.screen}
          onOpenSettings={onOpenSettings}
          onRequestPermission={onRequestPermission}
        />
        <PermissionCard
          actionLabel={microphoneReady ? "Microphone ready" : "Enable microphone"}
          busy={busyPermission === "microphone"}
          detail={
            microphoneReady
              ? "Microphones can be selected normally, but recording without one still works."
              : "Microphone access is optional. Leave it off or enable it for voice capture."
          }
          permission="microphone"
          status={permissions.microphone}
          onOpenSettings={onOpenSettings}
          onRequestPermission={onRequestPermission}
        />
      </div>

      <p className="support-copy">
        {screenReady
          ? "Screen access is ready. You can finish the recording request below."
          : "Grant screen access first. Microphone access can stay off if you only need system or screen capture."}
      </p>
    </section>
  );
}

function PermissionCard({
  permission,
  status,
  detail,
  actionLabel,
  busy,
  onRequestPermission,
  onOpenSettings,
}: {
  permission: PermissionKind;
  status: PermissionStatus;
  detail: string;
  actionLabel: string;
  busy: boolean;
  onRequestPermission: (permission: PermissionKind) => void;
  onOpenSettings: (permission: PermissionKind) => void;
}) {
  const ready = isPermitted(status);
  const actionVerb = status === "denied" ? "Open settings" : actionLabel;

  return (
    <article className={`permission-card${ready ? " is-ready" : ""}`}>
      <div className="permission-card-header">
        <div>
          <span className="permission-label">{permission}</span>
          <strong>{formatStatus(status)}</strong>
        </div>
        <span className={`permission-badge permission-${status}`}>{formatStatus(status)}</span>
      </div>
      <p>{detail}</p>
      <div className="button-row">
        {!ready ? (
          <button
            className="button button-primary"
            disabled={busy}
            type="button"
            onClick={() => {
              if (status === "denied") {
                onOpenSettings(permission);
                return;
              }

              onRequestPermission(permission);
            }}
          >
            {busy ? "Working..." : actionVerb}
          </button>
        ) : null}
        <button
          className="button"
          disabled={busy}
          type="button"
          onClick={() => {
            onOpenSettings(permission);
          }}
        >
          Open settings
        </button>
      </div>
    </article>
  );
}

function isPermitted(status: PermissionStatus) {
  return status === "granted" || status === "notNeeded";
}

function formatStatus(status: PermissionStatus) {
  return status === "notNeeded" ? "Not needed" : status;
}
