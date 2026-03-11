import { useEffect, useRef, useState } from "react";
import type { CompleteUploadResult, UploadFlowSnapshot } from "../lib/uploadFlow";

type CompleteRouteProps = {
  completion: CompleteUploadResult;
  snapshot: UploadFlowSnapshot | null;
  copyShareLinkByDefault: boolean;
  openBrowserByDefault: boolean;
  onReturnToRecorder: () => void;
};

export function CompleteRoute({
  completion,
  snapshot,
  copyShareLinkByDefault,
  openBrowserByDefault,
  onReturnToRecorder,
}: CompleteRouteProps) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "failed">("idle");
  const [browserState, setBrowserState] = useState<"idle" | "opened" | "blocked">("idle");
  const automatedActionsRun = useRef(false);

  useEffect(() => {
    if (automatedActionsRun.current) {
      return;
    }

    automatedActionsRun.current = true;

    void (async () => {
      if (copyShareLinkByDefault) {
        const copied = await copyToClipboard(completion.shareUrl);
        setCopyState(copied ? "success" : "failed");
      }

      if (openBrowserByDefault) {
        const opened = openInBrowser(completion.shareUrl);
        setBrowserState(opened ? "opened" : "blocked");
      }
    })();
  }, [completion.shareUrl, copyShareLinkByDefault, openBrowserByDefault]);

  const readiness = describeCompletionStatus(completion.status);

  return (
    <main className="layout">
      <section className="panel panel-primary">
        <div className="panel-header">
          <div>
            <p className="eyebrow">desktop://complete</p>
            <h1>{readiness.title}</h1>
          </div>
          <div className="metric">
            <span>Result</span>
            <strong>{completion.status}</strong>
          </div>
        </div>

        <p className="lede">{readiness.description}</p>

        <div className="status-grid">
          <StatusCard
            label="Share link"
            value={copyShareLinkByDefault ? "Copied by default" : "Ready to copy"}
            detail={completion.shareUrl}
          />
          <StatusCard
            label="Browser action"
            value={openBrowserByDefault ? "Open in browser enabled" : "Manual open"}
            detail={completion.canonicalDashboardUrl}
          />
          <StatusCard
            label="Playback state"
            value={readiness.stateLabel}
            detail={readiness.stateDetail}
          />
        </div>

        <section className="completion-card">
          <div className="completion-header">
            <div>
              <p className="eyebrow">share first</p>
              <h2>Default outcome</h2>
            </div>
          </div>

          <div className="share-link-row">
            <code>{completion.shareUrl}</code>
          </div>

          <div className="button-row">
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                void (async () => {
                  const copied = await copyToClipboard(completion.shareUrl);
                  setCopyState(copied ? "success" : "failed");
                })();
              }}
            >
              Copy share link
            </button>
            <a
              className="button-link button button-secondary"
              href={completion.shareUrl}
              rel="noreferrer"
              target="_blank"
              onClick={() => {
                setBrowserState("opened");
              }}
            >
              Open in Browser
            </a>
            <a
              className="button-link button"
              href={completion.canonicalDashboardUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open Dashboard
            </a>
            <button className="button" type="button" onClick={onReturnToRecorder}>
              Record another
            </button>
          </div>

          <p className="support-copy completion-copy-state">
            {formatCopyState(copyState, copyShareLinkByDefault)}
          </p>
          <p className="support-copy">{formatBrowserState(browserState, openBrowserByDefault)}</p>
          {snapshot?.videoPath ? (
            <p className="support-copy">
              Local fallback kept at <code>{snapshot.videoPath}</code>
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
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

function describeCompletionStatus(status: CompleteUploadResult["status"]) {
  switch (status) {
    case "ready":
      return {
        title: "Share link ready",
        description:
          "The upload finished and playback is already available. The share link is the primary output, with dashboard access still one click away.",
        stateLabel: "Ready",
        stateDetail: "Anyone with the share URL can open the finished recording now.",
      };
    case "processing":
    case "uploading":
      return {
        title: "Share link copied while Loam prepares playback",
        description:
          "The share URL is ready immediately, even though playback is still processing in the background. Open the dashboard if you want to watch Loam finish the video.",
        stateLabel: "Processing",
        stateDetail: "Mux is still preparing playback. The share page should resolve once processing completes.",
      };
    case "failed":
      return {
        title: "Upload recorded, playback needs attention",
        description:
          "Loam created the video record and share URL, but playback is not ready. Use the dashboard action to inspect the failed state.",
        stateLabel: "Needs attention",
        stateDetail: "Open the dashboard to inspect the video record and retry if needed.",
      };
  }
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function openInBrowser(url: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  return openedWindow !== null;
}

function formatCopyState(
  state: "idle" | "success" | "failed",
  copyShareLinkByDefault: boolean,
) {
  if (state === "success") {
    return copyShareLinkByDefault
      ? "Share link copied automatically."
      : "Share link copied.";
  }

  if (state === "failed") {
    return "Clipboard access was unavailable. Use the copy button or select the link manually.";
  }

  return copyShareLinkByDefault
    ? "The share link will be copied as soon as the browser allows clipboard access."
    : "Use the copy button if you want the share URL on your clipboard.";
}

function formatBrowserState(
  state: "idle" | "opened" | "blocked",
  openBrowserByDefault: boolean,
) {
  if (state === "opened") {
    return openBrowserByDefault
      ? "The share page was opened automatically."
      : "The share page was opened in the browser.";
  }

  if (state === "blocked") {
    return "The browser blocked the automatic open. Use the button to launch the share page.";
  }

  return openBrowserByDefault
    ? "The share page will open automatically when the browser allows it."
    : "Open in Browser launches the share page directly.";
}
