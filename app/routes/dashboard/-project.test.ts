import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkflowStatusOption,
  isTitleOverflowing,
  type VideoWorkflowStatus,
} from "./-project";

test("only enables expansion when the rendered title is actually clamped", () => {
  const text = { scrollWidth: 200 };
  assert.equal(isTitleOverflowing({ clientWidth: 220 }, text), false);
  assert.equal(isTitleOverflowing({ clientWidth: 120 }, text), true);
  // One pixel of subpixel rounding must not turn into an expander.
  assert.equal(isTitleOverflowing({ clientWidth: 199 }, text), false);
  assert.equal(isTitleOverflowing({ clientWidth: 198 }, text), true);
});

test("resolves a display option for every workflow status and no others", () => {
  for (const status of ["review", "rework", "done"] as const) {
    const option = getWorkflowStatusOption(status);
    assert.equal(option?.value, status);
    // A badge without a label or swatch cannot render consistently.
    assert.equal(typeof option?.label, "string");
    assert.equal(option?.swatch.startsWith("bg-"), true);
  }
  // Unknown statuses render no badge rather than a broken one.
  assert.equal(
    getWorkflowStatusOption("teapot" as VideoWorkflowStatus),
    undefined,
  );
});
