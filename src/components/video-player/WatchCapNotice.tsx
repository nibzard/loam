import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WatchCapNoticeProps {
  usageKind: "member" | "shared";
  controlsBelow?: boolean;
  className?: string;
}

const COPY = {
  member: {
    title: "Member watch limit reached",
    description:
      "Playback is paused until this workspace's monthly member watch-minute budget resets or the plan changes.",
  },
  shared: {
    title: "Shared-link watch limit reached",
    description:
      "Playback is paused until this workspace's monthly shared-link watch-minute budget resets or the plan changes.",
  },
} as const;

export function WatchCapNotice({
  usageKind,
  controlsBelow = false,
  className,
}: WatchCapNoticeProps) {
  const copy = COPY[usageKind];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-[var(--media-background)]",
        controlsBelow
          ? "flex h-full min-h-0 items-center justify-center"
          : "aspect-video rounded-xl border border-[var(--media-border)] shadow-[0_10px_40px_var(--media-shadow)]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-10 text-center text-[var(--media-text)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--media-outline)] bg-[var(--media-overlay-strong)]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-sm leading-6 text-[var(--media-text-dim)]">
            {copy.description}
          </p>
        </div>
      </div>
    </div>
  );
}
