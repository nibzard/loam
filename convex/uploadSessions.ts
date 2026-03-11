export const STALE_UPLOAD_OBJECT_CLEANUP_DELAY_MS = 75 * 60 * 1000;
const MUX_UPLOAD_PASSTHROUGH_PREFIX = "upload_v1";

export type UploadLifecycleStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export type UploadSessionState = {
  status: UploadLifecycleStatus;
  uploadGeneration?: number | null;
  uploadSessionToken?: string | null;
  s3Key?: string | null;
  muxAssetId?: string | null;
};

export type UploadCleanupTargets = {
  s3Key?: string;
  muxAssetId?: string;
};

export type UploadCompletionDecision =
  | { kind: "stale" }
  | { kind: "missing_object" }
  | { kind: "already_processing" }
  | { kind: "already_ready" }
  | { kind: "retry_required" }
  | { kind: "start_ingest"; s3Key: string };

export type UploadFailureDecision =
  | { kind: "stale" }
  | { kind: "ignored" }
  | { kind: "already_failed" }
  | { kind: "apply"; cleanup: UploadCleanupTargets | null };

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getNextUploadGeneration(currentGeneration?: number | null) {
  return typeof currentGeneration === "number" && Number.isFinite(currentGeneration)
    ? Math.max(0, Math.floor(currentGeneration)) + 1
    : 1;
}

export function getUploadCleanupTargets(
  state: Pick<UploadSessionState, "s3Key" | "muxAssetId">,
): UploadCleanupTargets | null {
  const s3Key = normalizeOptionalString(state.s3Key);
  const muxAssetId = normalizeOptionalString(state.muxAssetId);
  if (!s3Key && !muxAssetId) {
    return null;
  }

  return {
    s3Key,
    muxAssetId,
  };
}

export function buildMuxUploadPassthrough(videoId: string, uploadSessionToken: string) {
  return `${MUX_UPLOAD_PASSTHROUGH_PREFIX}:${videoId}:${uploadSessionToken}`;
}

export function parseMuxUploadPassthrough(
  passthrough: string | null | undefined,
): { videoId: string; uploadSessionToken: string } | null {
  if (!passthrough) {
    return null;
  }

  const [prefix, videoId, uploadSessionToken, extra] = passthrough.split(":");
  if (
    prefix !== MUX_UPLOAD_PASSTHROUGH_PREFIX ||
    !videoId ||
    !uploadSessionToken ||
    extra !== undefined
  ) {
    return null;
  }

  return { videoId, uploadSessionToken };
}

export function doesUploadReferenceMatch(
  state: Pick<UploadSessionState, "uploadSessionToken" | "muxAssetId">,
  candidate: {
    uploadSessionToken?: string | null;
    muxAssetId?: string | null;
    allowLegacyWithoutSession?: boolean;
  },
) {
  const uploadSessionToken = normalizeOptionalString(candidate.uploadSessionToken);
  if (uploadSessionToken) {
    return state.uploadSessionToken === uploadSessionToken;
  }

  const muxAssetId = normalizeOptionalString(candidate.muxAssetId);
  if (muxAssetId && state.muxAssetId === muxAssetId) {
    return true;
  }

  return candidate.allowLegacyWithoutSession === true && !state.uploadSessionToken;
}

export function classifyUploadCompletionAttempt(
  state: Pick<UploadSessionState, "status" | "uploadSessionToken" | "s3Key">,
  uploadSessionToken: string,
): UploadCompletionDecision {
  if (state.uploadSessionToken !== uploadSessionToken) {
    return { kind: "stale" };
  }

  const s3Key = normalizeOptionalString(state.s3Key);
  if (!s3Key) {
    return { kind: "missing_object" };
  }

  switch (state.status) {
    case "uploading":
      return { kind: "start_ingest", s3Key };
    case "processing":
      return { kind: "already_processing" };
    case "ready":
      return { kind: "already_ready" };
    case "failed":
      return { kind: "retry_required" };
  }
}

export function classifyUploadFailureAttempt(
  state: Pick<
    UploadSessionState,
    "status" | "uploadSessionToken" | "s3Key" | "muxAssetId"
  >,
  options: {
    uploadSessionToken?: string | null;
    muxAssetId?: string | null;
    allowProcessingFailure: boolean;
    allowLegacyWithoutSession?: boolean;
  },
): UploadFailureDecision {
  const matches = doesUploadReferenceMatch(state, {
    uploadSessionToken: options.uploadSessionToken,
    muxAssetId: options.muxAssetId,
    allowLegacyWithoutSession: options.allowLegacyWithoutSession,
  });
  if (!matches) {
    return { kind: "stale" };
  }

  if (state.status === "ready") {
    return { kind: "ignored" };
  }

  if (state.status === "processing" && !options.allowProcessingFailure) {
    return { kind: "ignored" };
  }

  if (state.status === "failed") {
    return { kind: "already_failed" };
  }

  return {
    kind: "apply",
    cleanup: getUploadCleanupTargets(state),
  };
}
