import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_UPLOAD_CONTENT_TYPES } from "./videoActions";

test("upload content-type allowlist accepts every format the UI promises", () => {
  // DropZone advertises MP4, M4V, MOV, WebM, MKV. The same set gates both
  // the initiate-time validation and the markUploadComplete HeadObject check.
  const expected = [
    "video/mp4",
    "video/x-m4v",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
  ];

  for (const contentType of expected) {
    assert.equal(
      ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType),
      true,
      `expected ${contentType} to be allowed`,
    );
  }
});

test("upload content-type allowlist rejects formats the drag filter should not accept", () => {
  assert.equal(ALLOWED_UPLOAD_CONTENT_TYPES.has("video/x-msvideo"), false);
  assert.equal(ALLOWED_UPLOAD_CONTENT_TYPES.has("video/avi"), false);
  assert.equal(ALLOWED_UPLOAD_CONTENT_TYPES.has("application/octet-stream"), false);
});
