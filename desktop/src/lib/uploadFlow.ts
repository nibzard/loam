import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  cancelUpload,
  describeDesktopError,
  listenToUploadProgress,
  uploadFile,
  type RecordingStopped,
} from "./tauri";

const GIBIBYTE = 1024 ** 3;
export const MAX_DIRECT_UPLOAD_BYTES = 5 * GIBIBYTE;

export type PrepareUploadArgs = {
  projectId: Id<"projects">;
  title: string;
  fileSize: number;
  contentType: string;
};

export type PrepareUploadResult = {
  videoId: Id<"videos">;
  publicId: string;
  uploadKey: string;
  uploadSessionToken: string;
  uploadUrl: string;
};

export type CompleteUploadArgs = {
  videoId: Id<"videos">;
  uploadSessionToken?: string;
};

export type CompleteUploadResult = {
  videoId: Id<"videos">;
  status: "uploading" | "processing" | "ready" | "failed";
  shareUrl: string;
  canonicalDashboardUrl: string;
};

export type FailUploadArgs = {
  videoId: Id<"videos">;
  uploadSessionToken?: string;
  message?: string;
};

export type FailUploadResult = {
  cleanupScheduled: boolean;
  outcome: "already_failed" | "applied" | "ignored" | "stale";
  success: boolean;
};

export const prepareUploadAction = makeFunctionReference<
  "action",
  PrepareUploadArgs,
  PrepareUploadResult
>("desktopRecorder:prepareUpload");

export const completeUploadAction = makeFunctionReference<
  "action",
  CompleteUploadArgs,
  CompleteUploadResult
>("desktopRecorder:completeUpload");

export const failUploadAction = makeFunctionReference<
  "action",
  FailUploadArgs,
  FailUploadResult
>("desktopRecorder:failUpload");

export type UploadFlowStep =
  | "idle"
  | "preparing"
  | "uploading"
  | "cancelling"
  | "finalizing"
  | "complete"
  | "cancelled"
  | "failed";

export type UploadFlowSnapshot = {
  step: UploadFlowStep;
  statusText: string;
  videoPath: string;
  title: string;
  uploadId: string | null;
  videoId: Id<"videos"> | null;
  bytesSent: number;
  totalBytes: number | null;
  fractionCompleted: number;
  error: string | null;
  shareUrl: string | null;
  canonicalDashboardUrl: string | null;
};

export type UploadFlowResult =
  | {
      status: "complete";
      completion: CompleteUploadResult;
      snapshot: UploadFlowSnapshot;
    }
  | {
      status: "cancelled" | "failed";
      error: string;
      snapshot: UploadFlowSnapshot;
    };

type UploadAction<Args, Result> = (
  args: Args,
) => Promise<Result>;

export type StartUploadFlowInput = {
  recording: RecordingStopped;
  projectId: Id<"projects">;
  title?: string;
  contentType?: string;
  prepareUpload: UploadAction<PrepareUploadArgs, PrepareUploadResult>;
  completeUpload: UploadAction<CompleteUploadArgs, CompleteUploadResult>;
  failUpload: UploadAction<FailUploadArgs, FailUploadResult>;
  onStateChange?: (snapshot: UploadFlowSnapshot) => void;
};

export type UploadFlowController = {
  cancel: () => Promise<void>;
  finished: Promise<UploadFlowResult>;
};

function getErrorMessage(error: unknown) {
  return describeDesktopError(error).message;
}

function isCancellationError(error: unknown) {
  return describeDesktopError(error).code === "UploadCancelled";
}

function buildInitialSnapshot(recording: RecordingStopped, title: string): UploadFlowSnapshot {
  return {
    step: "idle",
    statusText: "Ready to upload",
    videoPath: recording.videoPath,
    title,
    uploadId: null,
    videoId: null,
    bytesSent: 0,
    totalBytes: recording.fileSizeBytes,
    fractionCompleted: 0,
    error: null,
    shareUrl: null,
    canonicalDashboardUrl: null,
  };
}

function deriveTitle(videoPath: string) {
  const fileName = videoPath.split(/[\\/]/).pop() ?? "recording.mp4";
  const stripped = fileName.replace(/\.[^./\\]+$/, "").trim();
  return stripped || "recording";
}

function deriveCompletionStatusText(status: CompleteUploadResult["status"]) {
  switch (status) {
    case "ready":
      return "Share link ready";
    case "processing":
    case "uploading":
      return "Upload complete, playback processing";
    case "failed":
      return "Upload complete, playback needs attention";
  }
}

export function startUploadFlow(input: StartUploadFlowInput): UploadFlowController {
  const title = (input.title ?? deriveTitle(input.recording.videoPath)).trim() || "recording";
  const contentType = input.contentType ?? "video/mp4";
  const totalBytes = input.recording.fileSizeBytes ?? null;

  let snapshot = buildInitialSnapshot(input.recording, title);
  let preparedUpload: PrepareUploadResult | null = null;
  let cancellationRequested = false;
  let failureReported = false;
  let unlistenProgress: (() => void) | null = null;
  let cancelPromise: Promise<void> | null = null;

  const publish = (next: Partial<UploadFlowSnapshot>) => {
    snapshot = {
      ...snapshot,
      ...next,
    };
    input.onStateChange?.(snapshot);
  };

  const reportFailure = async (message: string) => {
    if (!preparedUpload || failureReported) {
      return;
    }

    failureReported = true;
    try {
      await input.failUpload({
        videoId: preparedUpload.videoId,
        uploadSessionToken: preparedUpload.uploadSessionToken,
        message,
      });
    } catch (error) {
      console.error("Failed to mark desktop upload failure", error);
    }
  };

  const cancel = async () => {
    if (cancelPromise) {
      return cancelPromise;
    }

    cancellationRequested = true;
    publish({
      step: preparedUpload ? "cancelling" : "preparing",
      statusText: "Cancelling upload...",
    });

    cancelPromise = (async () => {
      if (preparedUpload) {
        await cancelUpload(preparedUpload.uploadKey);
      }
    })();

    try {
      await cancelPromise;
    } finally {
      cancelPromise = null;
    }
  };

  const finished = (async (): Promise<UploadFlowResult> => {
    try {
      if (totalBytes === null || totalBytes <= 0) {
        throw new Error("Recording file size is unavailable. Stop the recording again before uploading.");
      }

      if (totalBytes > MAX_DIRECT_UPLOAD_BYTES) {
        throw new Error("UploadTooLarge");
      }

      publish({
        step: "preparing",
        statusText: "Preparing upload...",
      });

      preparedUpload = await input.prepareUpload({
        projectId: input.projectId,
        title,
        fileSize: totalBytes ?? 0,
        contentType,
      });

      publish({
        step: cancellationRequested ? "cancelling" : "uploading",
        statusText: cancellationRequested ? "Cancelling upload..." : "Uploading recording...",
        uploadId: preparedUpload.uploadKey,
        videoId: preparedUpload.videoId,
        totalBytes,
      });

      if (cancellationRequested) {
        throw new Error("Upload cancelled");
      }

      unlistenProgress = await listenToUploadProgress((event) => {
        if (event.uploadId !== preparedUpload?.uploadKey) {
          return;
        }

        publish({
          step: cancellationRequested ? "cancelling" : "uploading",
          statusText: cancellationRequested ? "Cancelling upload..." : "Uploading recording...",
          bytesSent: event.bytesSent,
          totalBytes: event.totalBytes,
          fractionCompleted: event.fractionCompleted,
        });
      });

      await uploadFile({
        uploadUrl: preparedUpload.uploadUrl,
        videoPath: input.recording.videoPath,
        contentType,
        uploadId: preparedUpload.uploadKey,
      });

      unlistenProgress?.();
      unlistenProgress = null;

      if (cancellationRequested) {
        throw new Error("Upload cancelled");
      }

      publish({
        step: "finalizing",
        statusText: "Finishing in Loam...",
        bytesSent: snapshot.totalBytes ?? snapshot.bytesSent,
        fractionCompleted: 1,
      });

      const completion = await input.completeUpload({
        videoId: preparedUpload.videoId,
        uploadSessionToken: preparedUpload.uploadSessionToken,
      });

      publish({
        step: "complete",
        statusText: deriveCompletionStatusText(completion.status),
        bytesSent: snapshot.totalBytes ?? snapshot.bytesSent,
        fractionCompleted: 1,
        shareUrl: completion.shareUrl,
        canonicalDashboardUrl: completion.canonicalDashboardUrl,
      });

      return {
        status: "complete",
        completion,
        snapshot,
      };
    } catch (error) {
      unlistenProgress?.();
      unlistenProgress = null;

      const message = getErrorMessage(error);
      const cancelled = cancellationRequested || isCancellationError(error);

      await reportFailure(message);

      publish({
        step: cancelled ? "cancelled" : "failed",
        statusText: cancelled ? "Upload cancelled" : "Upload failed",
        error: message,
      });

      return {
        status: cancelled ? "cancelled" : "failed",
        error: message,
        snapshot,
      };
    }
  })();

  return {
    cancel,
    finished,
  };
}

export type PrepareUploadActionReference = FunctionReference<
  "action",
  "public",
  PrepareUploadArgs,
  PrepareUploadResult
>;
