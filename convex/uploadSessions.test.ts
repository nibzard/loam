import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMuxUploadPassthrough,
  classifyUploadCompletionAttempt,
  classifyUploadFailureAttempt,
  doesUploadReferenceMatch,
  getNextUploadGeneration,
  getUploadCleanupTargets,
  parseMuxUploadPassthrough,
} from "./uploadSessions";

test("replacement upload planning increments generation and keeps cleanup targets explicit", () => {
  assert.equal(getNextUploadGeneration(undefined), 1);
  assert.equal(getNextUploadGeneration(0), 1);
  assert.equal(getNextUploadGeneration(4), 5);

  assert.deepEqual(
    getUploadCleanupTargets({
      muxAssetId: "asset_old",
      s3Key: "videos/old.mp4",
    }),
    {
      muxAssetId: "asset_old",
      s3Key: "videos/old.mp4",
    },
  );
});

test("duplicate completion calls for the active upload collapse to a stable no-op", () => {
  const state = {
    s3Key: "videos/current.mp4",
    status: "processing" as const,
    uploadSessionToken: "session_current",
  };

  assert.deepEqual(
    classifyUploadCompletionAttempt(state, "session_current"),
    { kind: "already_processing" },
  );
});

test("completion attempts distinguish ready and failed uploads from active ingest starts", () => {
  assert.deepEqual(
    classifyUploadCompletionAttempt(
      {
        s3Key: "videos/current.mp4",
        status: "ready",
        uploadSessionToken: "session_current",
      },
      "session_current",
    ),
    { kind: "already_ready" },
  );

  assert.deepEqual(
    classifyUploadCompletionAttempt(
      {
        s3Key: "videos/current.mp4",
        status: "failed",
        uploadSessionToken: "session_current",
      },
      "session_current",
    ),
    { kind: "retry_required" },
  );
});

test("stale upload sessions cannot claim completion after a retry rotates the token", () => {
  const state = {
    s3Key: "videos/current.mp4",
    status: "uploading" as const,
    uploadSessionToken: "session_new",
  };

  assert.deepEqual(
    classifyUploadCompletionAttempt(state, "session_old"),
    { kind: "stale" },
  );
});

test("active upload failures retain cleanup targets while stale failures become no-ops", () => {
  const activeState = {
    muxAssetId: "asset_current",
    s3Key: "videos/current.mp4",
    status: "uploading" as const,
    uploadSessionToken: "session_current",
  };

  assert.deepEqual(
    classifyUploadFailureAttempt(activeState, {
      allowProcessingFailure: false,
      uploadSessionToken: "session_current",
    }),
    {
      kind: "apply",
      cleanup: {
        muxAssetId: "asset_current",
        s3Key: "videos/current.mp4",
      },
    },
  );

  assert.deepEqual(
    classifyUploadFailureAttempt(activeState, {
      allowProcessingFailure: false,
      uploadSessionToken: "session_old",
    }),
    { kind: "stale" },
  );
});

test("processing uploads ignore non-processing failures unless explicitly allowed", () => {
  const processingState = {
    muxAssetId: "asset_current",
    s3Key: "videos/current.mp4",
    status: "processing" as const,
    uploadSessionToken: "session_current",
  };

  assert.deepEqual(
    classifyUploadFailureAttempt(processingState, {
      allowProcessingFailure: false,
      uploadSessionToken: "session_current",
    }),
    { kind: "ignored" },
  );

  assert.deepEqual(
    classifyUploadFailureAttempt(processingState, {
      allowProcessingFailure: true,
      uploadSessionToken: "session_current",
    }),
    {
      kind: "apply",
      cleanup: {
        muxAssetId: "asset_current",
        s3Key: "videos/current.mp4",
      },
    },
  );
});

test("mux passthrough values round-trip the upload session and reject malformed payloads", () => {
  const passthrough = buildMuxUploadPassthrough("video_123", "session_456");

  assert.deepEqual(parseMuxUploadPassthrough(passthrough), {
    uploadSessionToken: "session_456",
    videoId: "video_123",
  });
  assert.equal(parseMuxUploadPassthrough("video_123"), null);
  assert.equal(parseMuxUploadPassthrough("upload_v1:video_123"), null);

  assert.equal(
    doesUploadReferenceMatch(
      { muxAssetId: undefined, uploadSessionToken: undefined },
      { allowLegacyWithoutSession: true },
    ),
    true,
  );
});
