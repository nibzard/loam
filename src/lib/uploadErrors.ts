import { ConvexError } from "convex/values";

/**
 * Our backend throws coded ConvexErrors shaped { code, message } for every
 * upload-path failure: access and role checks (convex/auth.ts), subscription
 * and storage-limit checks (convex/billingHelpers.ts), and the size and format
 * checks (convex/videoActions.ts). Plain Error messages are redacted by Convex
 * in production, so the client has to read the structured data to show the
 * real reason an upload failed.
 */
export interface CodedUploadErrorData {
  code?: unknown;
  message?: unknown;
}

/** Friendly fallbacks per error code, used when the data carries no message. */
export const UPLOAD_ERROR_CODE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Sign in again to upload.",
  FORBIDDEN:
    "Upload not allowed. Check your access, subscription, and team storage.",
  NOT_FOUND: "This project or video no longer exists. Refresh the page.",
  BAD_REQUEST: "This file cannot be uploaded. Check the video format and size.",
};

function getErrorData(error: unknown): unknown {
  if (error instanceof ConvexError) {
    return error.data;
  }
  if (typeof error === "object" && error !== null && "data" in error) {
    return (error as { data: unknown }).data;
  }
  return null;
}

/**
 * Resolve the user-facing message for an upload failure. Prefers the coded
 * error's message, then the per-code fallback, then the plain Error message,
 * then the caller's fallback. Structured errors never fall through to
 * `error.message`, which is just the stringified data.
 */
export function getUploadErrorMessage(error: unknown, fallback: string): string {
  const data = getErrorData(error);

  if (typeof data === "string" && data.length > 0) {
    return data;
  }

  if (typeof data === "object" && data !== null) {
    const { code, message } = data as CodedUploadErrorData;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
    if (typeof code === "string" && UPLOAD_ERROR_CODE_MESSAGES[code]) {
      return UPLOAD_ERROR_CODE_MESSAGES[code];
    }
    return fallback;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}
