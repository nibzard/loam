import type { UploadFlowSnapshot } from "../lib/uploadFlow";

type UploadProgressProps = {
  snapshot: UploadFlowSnapshot;
  canCancel: boolean;
  onCancel: () => void;
};

export function UploadProgress({
  snapshot,
  canCancel,
  onCancel,
}: UploadProgressProps) {
  const percent = Math.round(snapshot.fractionCompleted * 100);

  return (
    <section className="upload-progress">
      <div className="panel-header">
        <div>
          <p className="eyebrow">upload pipeline</p>
          <h1>{snapshot.statusText}</h1>
        </div>
        <div className="metric">
          <span>Progress</span>
          <strong>{percent}%</strong>
        </div>
      </div>

      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="status-grid upload-stats">
        <article className="status-card">
          <span>File</span>
          <strong>{snapshot.title}</strong>
          <p>{snapshot.videoPath}</p>
        </article>
        <article className="status-card">
          <span>Transferred</span>
          <strong>{formatBytes(snapshot.bytesSent)}</strong>
          <p>
            of{" "}
            {snapshot.totalBytes === null ? "unknown size" : formatBytes(snapshot.totalBytes)}
          </p>
        </article>
        <article className="status-card">
          <span>State</span>
          <strong>{snapshot.step}</strong>
          <p>{snapshot.uploadId ? `Native upload ${snapshot.uploadId}` : "Waiting for upload slot"}</p>
        </article>
      </div>

      {snapshot.error ? <p className="error-copy">{snapshot.error}</p> : null}

      <div className="button-row">
        <button
          className="button button-danger"
          disabled={!canCancel}
          onClick={onCancel}
        >
          {snapshot.step === "cancelling" ? "Cancelling..." : "Cancel upload"}
        </button>
      </div>
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
