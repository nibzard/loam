import { useEffect } from "react";
import { UploadProgress } from "../components/UploadProgress";
import type { UploadFlowSnapshot } from "../lib/uploadFlow";

type UploadingRouteProps = {
  snapshot: UploadFlowSnapshot;
  navigationLocked: boolean;
  onCancel: () => void;
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

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
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
