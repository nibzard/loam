import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { UploadProgress } from "../components/UploadProgress";
import type { UploadFlowSnapshot } from "../lib/uploadFlow";

type UploadingRouteProps = {
  snapshot: UploadFlowSnapshot;
  navigationLocked: boolean;
  onCancel: () => Promise<void>;
};

export function UploadingRoute({
  snapshot,
  navigationLocked,
  onCancel,
}: UploadingRouteProps) {
  useEffect(() => {
    if (!navigationLocked) {
      return;
    }

    let disposed = false;
    let closeInFlight = false;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      void onCancel();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const maybeListenForClose = async () => {
      if (!("__TAURI_INTERNALS__" in window)) {
        return () => {};
      }

      return getCurrentWindow().onCloseRequested(async (event) => {
        if (closeInFlight || disposed) {
          return;
        }

        closeInFlight = true;
        event.preventDefault();

        try {
          await onCancel();
        } finally {
          if (!disposed) {
            await getCurrentWindow().destroy();
          }
        }
      });
    };

    let unlistenClose: (() => void) | null = null;
    void maybeListenForClose().then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      unlistenClose = unlisten;
    });

    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlistenClose?.();
    };
  }, [navigationLocked]);

  return (
    <main className="layout">
      <section className="panel panel-primary">
        <p className="eyebrow">desktop://uploading</p>
        <p className="lede">
          Loam keeps the renderer on this route until the native upload either
          finishes or you explicitly cancel it.
        </p>
        <UploadProgress
          snapshot={snapshot}
          canCancel={navigationLocked}
          onCancel={onCancel}
        />
      </section>
    </main>
  );
}
