import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";

import {
  getCodedErrorMessage,
  getUploadErrorMessage,
  UPLOAD_ERROR_CODE_MESSAGES,
} from "./uploadErrors";

test("prefers the coded error message", () => {
  const error = new ConvexError({
    code: "FORBIDDEN",
    message:
      "Storage limit reached for the starter plan. Upgrade to continue uploading.",
  });

  assert.equal(
    getUploadErrorMessage(error, "Upload failed"),
    "Storage limit reached for the starter plan. Upgrade to continue uploading.",
  );
});

test("falls back per code when the data carries no message", () => {
  for (const code of Object.keys(UPLOAD_ERROR_CODE_MESSAGES)) {
    const error = new ConvexError({ code });
    assert.equal(
      getUploadErrorMessage(error, "Upload failed"),
      UPLOAD_ERROR_CODE_MESSAGES[code],
      `expected a friendly fallback for ${code}`,
    );
  }
});

test("keeps unknown codes on the caller fallback", () => {
  const error = new ConvexError({ code: "TEAPOT" });
  assert.equal(getUploadErrorMessage(error, "Upload failed"), "Upload failed");
});

test("reads flat string ConvexError data", () => {
  const error = new ConvexError("Unsupported video format.");
  assert.equal(
    getUploadErrorMessage(error, "Upload failed"),
    "Unsupported video format.",
  );
});

test("reads coded data from errors that are not ConvexError instances", () => {
  const error = { data: { code: "UNAUTHENTICATED" } };
  assert.equal(
    getUploadErrorMessage(error, "Upload failed"),
    UPLOAD_ERROR_CODE_MESSAGES.UNAUTHENTICATED,
  );
});

test("keeps plain Error messages for client-side failures", () => {
  assert.equal(
    getUploadErrorMessage(new Error("Upload failed: Network error"), "Upload failed"),
    "Upload failed: Network error",
  );
});

test("returns the fallback for thrown values without a message", () => {
  assert.equal(getUploadErrorMessage("nope", "Upload failed"), "Upload failed");
  assert.equal(getUploadErrorMessage(null, "Processing failed"), "Processing failed");
});

test("getCodedErrorMessage prefers the object data's message", () => {
  const error = new ConvexError({
    code: "BAD_REQUEST",
    message: "You can act on at most 100 videos at once.",
  });
  assert.equal(
    getCodedErrorMessage(error, "Action failed"),
    "You can act on at most 100 videos at once.",
  );
});

test("getCodedErrorMessage reads flat string data", () => {
  const error = new ConvexError("Videos can only move within one team.");
  assert.equal(
    getCodedErrorMessage(error, "Action failed"),
    "Videos can only move within one team.",
  );
});

test("getCodedErrorMessage applies the caller's per-code fallbacks", () => {
  const codeMessages = { TEAPOT: "Short and stout." };
  assert.equal(
    getCodedErrorMessage(new ConvexError({ code: "TEAPOT" }), "Action failed", codeMessages),
    "Short and stout.",
  );
  // A code the caller did not map stays on the caller fallback.
  assert.equal(
    getCodedErrorMessage(new ConvexError({ code: "UNAUTHENTICATED" }), "Action failed", codeMessages),
    "Action failed",
  );
});

test("getCodedErrorMessage returns the fallback for unknown shapes", () => {
  // Non-string, non-object data decodes nowhere useful.
  assert.equal(
    getCodedErrorMessage(new ConvexError(42), "Action failed"),
    "Action failed",
  );
  // A non-string message field is ignored, not stringified.
  assert.equal(
    getCodedErrorMessage({ data: { code: "BAD_REQUEST", message: 7 } }, "Action failed"),
    "Action failed",
  );
  // Thrown values without structure keep the caller fallback.
  assert.equal(getCodedErrorMessage("nope", "Action failed"), "Action failed");
  assert.equal(getCodedErrorMessage(null, "Action failed"), "Action failed");
  assert.equal(getCodedErrorMessage({ data: null }, "Action failed"), "Action failed");
});

test("getUploadErrorMessage routes through the shared decoder", () => {
  // The upload wrapper and the shared decoder agree on every shape.
  for (const error of [
    new ConvexError({ code: "FORBIDDEN", message: "Storage limit reached." }),
    new ConvexError("Unsupported video format."),
    new ConvexError({ code: "TEAPOT" }),
    new Error("Upload failed: Network error"),
    "nope",
    null,
  ]) {
    assert.equal(
      getUploadErrorMessage(error, "Upload failed"),
      getCodedErrorMessage(error, "Upload failed", UPLOAD_ERROR_CODE_MESSAGES),
    );
  }
});
