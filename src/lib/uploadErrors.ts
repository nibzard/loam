import { ConvexError } from "convex/values";

/**
 * Our backend throws coded ConvexErrors shaped { code, message } for every
 * coded failure: access and role checks (convex/auth.ts), subscription and
 * storage-limit checks (convex/billingHelpers.ts), the size and format checks
 * (convex/videoActions.ts), and the bulk-action limits (convex/videos.ts).
 * Plain Error messages are redacted by Convex in production, so the client
 * has to read the structured data to show the real reason a call failed.
 */
export interface CodedErrorData {
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

/**
 * The structured data a coded error carries, or `undefined` when the error
 * has no data channel at all (plain Errors, thrown strings, and so on).
 */
function getErrorData(error: unknown): unknown {
  if (error instanceof ConvexError) {
    return error.data;
  }
  if (typeof error === "object" && error !== null && "data" in error) {
    return (error as { data: unknown }).data;
  }
  return undefined;
}

/**
 * Decode a coded error into a user-facing message. Prefers the coded error's
 * message, then the per-code fallback from `codeMessages`, then the plain
 * Error message, then the caller's fallback. An error that carries structured
 * data never falls through to `error.message`: that message is only the
 * stringified data, so an unreadable shape (a number, null, an object without
 * a message or known code) goes straight to the caller's fallback.
 */
export function getCodedErrorMessage(
  error: unknown,
  fallback: string,
  codeMessages: Record<string, string> = {},
): string {
  const data = getErrorData(error);

  if (data !== undefined) {
    if (typeof data === "string") {
      return data.length > 0 ? data : fallback;
    }
    if (typeof data === "object" && data !== null) {
      const { code, message } = data as CodedErrorData;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
      if (typeof code === "string" && codeMessages[code]) {
        return codeMessages[code];
      }
    }
    return fallback;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

/**
 * Resolve the user-facing message for an upload failure: the shared decoder
 * with the upload path's per-code fallbacks.
 */
export function getUploadErrorMessage(error: unknown, fallback: string): string {
  return getCodedErrorMessage(error, fallback, UPLOAD_ERROR_CODE_MESSAGES);
}
