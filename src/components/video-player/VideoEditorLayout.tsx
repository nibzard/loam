import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Escape stays with the focused control: inputs, menus, and dialogs keep it. */
const THEATER_ESCAPE_INTERACTIVE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menu"], [role="listbox"], [role="dialog"]';

/** Decide whether a keydown leaves theater mode. Pure so tests can run it without a DOM. */
export function theaterEscapeShortcut(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented">,
  target: { closest: (selector: string) => unknown } | null,
) {
  if (event.defaultPrevented || event.key !== "Escape") return false;
  return !target?.closest(THEATER_ESCAPE_INTERACTIVE);
}

interface VideoEditorLayoutProps {
  /** Pins the editor over dashboard navigation with a fixed overlay while true. */
  open: boolean;
  /** Toggles theater mode. The exit bar and the Escape key call this. */
  onToggle: () => void;
  /** The editor subtree. It stays mounted in both modes. */
  children: ReactNode;
  className?: string;
}

/**
 * Keep the whole editor subtree mounted while pinning it over the dashboard.
 * The data-video-editor attribute scopes editor playback shortcuts; see
 * ./bindPlaybackShortcuts.
 */
export function VideoEditorLayout({
  open,
  onToggle,
  children,
  className,
}: VideoEditorLayoutProps) {
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!theaterEscapeShortcut(event, target)) return;
      event.preventDefault();
      onToggleRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      data-video-editor
      data-theater={open ? "true" : undefined}
      className={cn(
        "flex h-full min-h-0 flex-col",
        open && "fixed inset-0 z-40 bg-[var(--media-background)]",
        className,
      )}
    >
      {children}
      {open ? <TheaterExitBar onToggle={onToggle} /> : null}
    </div>
  );
}

function TheaterExitBar({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t-2 border-[var(--media-outline-strong)] bg-[var(--media-background)] px-4 py-2">
      <span className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--media-text-faint)]">
        Theater mode
      </span>
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs uppercase tracking-wider text-[var(--media-text-faint)] sm:inline">
          Esc to exit
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Exit theater mode"
          className="inline-flex h-8 items-center gap-1.5 border-2 border-[var(--media-text)] bg-[var(--media-text)] px-3 font-mono text-xs font-bold uppercase tracking-wider text-[var(--media-background)] transition hover:bg-transparent hover:text-[var(--media-text)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Exit
        </button>
      </div>
    </div>
  );
}
