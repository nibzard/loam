import { useMemo, useState } from "react";

type ScreenId =
  | "login"
  | "permissions"
  | "recorder"
  | "uploading"
  | "complete";

type ScreenDefinition = {
  id: ScreenId;
  eyebrow: string;
  title: string;
  description: string;
  hint: string;
  metricLabel: string;
  metricValue: string;
};

const SCREENS: ScreenDefinition[] = [
  {
    id: "login",
    eyebrow: "01 auth",
    title: "Use the existing Loam identity",
    description:
      "The renderer stays thin: Clerk and Convex live here, while Rust remains focused on native capture.",
    hint: "Desktop auth wiring lands next. The shell already reserves the screen and user flow.",
    metricLabel: "Target boot",
    metricValue: "< 4 clicks to latest video",
  },
  {
    id: "permissions",
    eyebrow: "02 permissions",
    title: "Ask once, get out of the way",
    description:
      "Screen and microphone access are treated as launch prerequisites, with direct paths to request or fix them.",
    hint: "Permission commands are intentionally deferred to the native surface instead of hidden in the renderer.",
    metricLabel: "Native surface",
    metricValue: "Small by default",
  },
  {
    id: "recorder",
    eyebrow: "03 setup",
    title: "One setup view for target, mic, and project",
    description:
      "The main recording screen is shaped for speed: choose a target, keep defaults sticky, and start immediately.",
    hint: "This shell establishes the route and content regions without committing to final state management yet.",
    metricLabel: "Primary action",
    metricValue: "Record locally",
  },
  {
    id: "uploading",
    eyebrow: "04 upload",
    title: "Local-first output, then a fast share link",
    description:
      "Uploads stay off the critical recording path. Native code streams bytes while the renderer tracks progress and result state.",
    hint: "The backend contract returns the final share URL so the UI never rebuilds it manually.",
    metricLabel: "Default output",
    metricValue: "Share link",
  },
  {
    id: "complete",
    eyebrow: "05 finish",
    title: "Copy the link and move on",
    description:
      "The completion state is optimized for immediacy: copy, open in browser, or start another recording without hunting.",
    hint: "Mux playback can still be processing; the desktop shell still has a finished state with useful next actions.",
    metricLabel: "User promise",
    metricValue: "Fast to share",
  },
];

const COMMAND_SURFACE = [
  "checkPermissions()",
  "requestPermission(permission)",
  "openPermissionSettings(permission)",
  "listCaptureDisplays()",
  "listCaptureWindows()",
  "listMicrophones()",
  "isSystemAudioSupported()",
  "startRecording(input)",
  "pauseRecording()",
  "resumeRecording()",
  "stopRecording()",
  "cancelRecording()",
  "getCurrentRecording()",
  "uploadFile(input)",
];

export function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("recorder");
  const currentScreen = useMemo(
    () => SCREENS.find((screen) => screen.id === activeScreen) ?? SCREENS[0],
    [activeScreen],
  );

  return (
    <>
      <GlobalStyles />
      <div className="app-shell">
        <div className="hero-glow hero-glow-left" />
        <div className="hero-glow hero-glow-right" />
        <header className="topbar">
          <div>
            <p className="kicker">Loam Desktop Recorder</p>
            <h1>React and Tauri shell</h1>
          </div>
          <div className="build-chip">
            <span className="build-label">Boot state</span>
            <strong>Scaffolded</strong>
          </div>
        </header>

        <main className="layout">
          <section className="panel panel-primary">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{currentScreen.eyebrow}</p>
                <h2>{currentScreen.title}</h2>
              </div>
              <div className="metric">
                <span>{currentScreen.metricLabel}</span>
                <strong>{currentScreen.metricValue}</strong>
              </div>
            </div>

            <p className="lede">{currentScreen.description}</p>

            <div className="screen-grid">
              {SCREENS.map((screen) => (
                <button
                  key={screen.id}
                  className={`screen-card${screen.id === activeScreen ? " is-active" : ""}`}
                  onClick={() => setActiveScreen(screen.id)}
                  type="button"
                >
                  <span>{screen.eyebrow}</span>
                  <strong>{screen.title}</strong>
                  <p>{screen.hint}</p>
                </button>
              ))}
            </div>

            <div className="preview">
              <div className="preview-toolbar">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <span className="toolbar-label">desktop://{currentScreen.id}</span>
              </div>
              <div className="preview-body">
                <div className="preview-stage">
                  <p className="preview-kicker">{currentScreen.eyebrow}</p>
                  <h3>{currentScreen.title}</h3>
                  <p>{currentScreen.description}</p>
                </div>
                <aside className="preview-side">
                  <div className="status-block">
                    <span>Ready for next task</span>
                    <strong>Auth and native commands plug into this shell next.</strong>
                  </div>
                  <div className="status-block muted">
                    <span>Why this scaffold</span>
                    <strong>Fast boot, narrow Rust surface, and one clear app route model.</strong>
                  </div>
                </aside>
              </div>
            </div>
          </section>

          <section className="panel panel-secondary">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Native seam</p>
                <h2>Initial command contract</h2>
              </div>
            </div>

            <ul className="command-list">
              {COMMAND_SURFACE.map((command) => (
                <li key={command}>{command}</li>
              ))}
            </ul>

            <div className="footnote">
              The Rust bootstrap exposes only a shell health check today. Future tasks can fill the command surface without reworking app boot.
            </div>
          </section>
        </main>
      </div>
    </>
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

      button {
        font: inherit;
      }

      .app-shell {
        min-height: 100vh;
        padding: 32px;
        position: relative;
        overflow: hidden;
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

      .topbar,
      .panel {
        position: relative;
        z-index: 1;
      }

      .topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin: 0 auto 24px;
        max-width: 1280px;
      }

      .kicker,
      .eyebrow,
      .build-label,
      .preview-kicker,
      .toolbar-label,
      .metric span,
      .status-block span {
        font-family: "IBM Plex Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3,
      strong {
        margin: 0;
      }

      h1 {
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        font-size: clamp(2.6rem, 5vw, 4.8rem);
        line-height: 0.92;
        letter-spacing: -0.05em;
        max-width: 10ch;
      }

      h2 {
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
        font-size: clamp(1.5rem, 3vw, 2.4rem);
        line-height: 1;
        letter-spacing: -0.04em;
      }

      h3 {
        font-family: "Instrument Serif", Georgia, serif;
        font-size: clamp(2rem, 3vw, 2.8rem);
        font-weight: 400;
        line-height: 0.98;
      }

      .build-chip,
      .metric,
      .status-block,
      .screen-card,
      .panel,
      .preview {
        border: 2px solid var(--border);
        box-shadow: 10px 10px 0 0 var(--shadow-color);
      }

      .build-chip {
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(16px);
        min-width: 160px;
        padding: 12px 14px;
      }

      .build-chip strong,
      .metric strong,
      .status-block strong {
        display: block;
        font-size: 1rem;
        margin-top: 8px;
      }

      .layout {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.95fr);
        margin: 0 auto;
        max-width: 1280px;
      }

      .panel {
        background: var(--surface);
        backdrop-filter: blur(18px);
        padding: 24px;
      }

      .panel-primary {
        display: grid;
        gap: 24px;
      }

      .panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .panel-header.compact {
        justify-content: flex-start;
      }

      .metric,
      .status-block {
        background: var(--surface-muted);
        padding: 12px 14px;
        max-width: 220px;
      }

      .lede {
        font-size: 1.1rem;
        line-height: 1.6;
        margin: 0;
        max-width: 62ch;
      }

      .screen-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .screen-card {
        background: rgba(255, 255, 255, 0.74);
        cursor: pointer;
        min-height: 180px;
        padding: 14px;
        text-align: left;
        transition:
          transform 140ms ease,
          box-shadow 140ms ease,
          background 140ms ease;
      }

      .screen-card:hover,
      .screen-card:focus-visible,
      .screen-card.is-active {
        background: var(--accent-soft);
        box-shadow: 6px 6px 0 0 var(--shadow-color);
        transform: translate(4px, 4px);
      }

      .screen-card strong {
        display: block;
        font-size: 1.1rem;
        margin: 12px 0 10px;
      }

      .screen-card p,
      .preview-stage p,
      .footnote {
        color: var(--foreground-muted);
        line-height: 1.55;
        margin: 0;
      }

      .preview {
        background: linear-gradient(160deg, rgba(26, 26, 26, 0.96), rgba(45, 90, 45, 0.94));
        color: var(--foreground-inverse);
        overflow: hidden;
      }

      .preview-toolbar {
        align-items: center;
        border-bottom: 2px solid rgba(240, 240, 232, 0.2);
        display: flex;
        gap: 8px;
        padding: 12px 16px;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(240, 240, 232, 0.5);
      }

      .toolbar-label {
        margin-left: 8px;
        opacity: 0.78;
      }

      .preview-body {
        display: grid;
        gap: 20px;
        grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.75fr);
        padding: 24px;
      }

      .preview-stage {
        display: grid;
        align-content: start;
        gap: 18px;
        min-height: 280px;
      }

      .preview-stage p {
        color: rgba(240, 240, 232, 0.74);
        max-width: 40ch;
      }

      .preview-side {
        display: grid;
        gap: 14px;
      }

      .status-block {
        background: rgba(240, 240, 232, 0.12);
        box-shadow: 6px 6px 0 0 rgba(240, 240, 232, 0.22);
      }

      .status-block.muted {
        background: rgba(240, 240, 232, 0.08);
      }

      .command-list {
        display: grid;
        gap: 10px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .command-list li {
        background: rgba(255, 255, 255, 0.64);
        border: 2px solid var(--border);
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.92rem;
        padding: 10px 12px;
      }

      .footnote {
        border-top: 2px solid rgba(26, 26, 26, 0.18);
        margin-top: 20px;
        padding-top: 18px;
      }

      @media (max-width: 1080px) {
        .layout,
        .preview-body,
        .screen-grid {
          grid-template-columns: 1fr;
        }

        .metric {
          max-width: none;
        }
      }

      @media (max-width: 720px) {
        .app-shell {
          padding: 18px;
        }

        .topbar,
        .panel-header {
          flex-direction: column;
        }

        .panel,
        .screen-card,
        .metric,
        .status-block,
        .preview,
        .build-chip {
          box-shadow: 6px 6px 0 0 var(--shadow-color);
        }
      }
    `}</style>
  );
}
