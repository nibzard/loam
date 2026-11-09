import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";

import {
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
