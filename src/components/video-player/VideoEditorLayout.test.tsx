import assert from "node:assert/strict";
import test from "node:test";
import { renderToString } from "react-dom/server";

import {
  VideoEditorLayout,
  theaterEscapeShortcut,
} from "./VideoEditorLayout";

test("keeps children mounted in the normal flow while theater mode is closed", () => {
  const html = renderToString(
    <VideoEditorLayout open={false} onToggle={() => {}}>
      <p>editor body</p>
    </VideoEditorLayout>,
  );

  assert.match(html, /editor body/);
  assert.match(html, /data-video-editor/);
  assert.doesNotMatch(html, /fixed inset-0/);
  assert.doesNotMatch(html, /data-theater/);
  assert.doesNotMatch(html, /Exit theater mode/);
});

test("pins the editor over the dashboard while theater mode is open", () => {
  const html = renderToString(
    <VideoEditorLayout open onToggle={() => {}}>
      <p>editor body</p>
    </VideoEditorLayout>,
  );

  assert.match(html, /fixed inset-0/);
  assert.match(html, /z-40/);
  assert.match(html, /data-theater="true"/);
  assert.match(html, /editor body/);
  assert.match(html, /Exit theater mode/);
  assert.match(html, /Esc to exit/);
});

test("escape exits theater mode only from plain editor chrome", () => {
  const plain = { closest: () => null };
  const interactive = { closest: () => ({}) };

  assert.equal(theaterEscapeShortcut({ key: "Escape", defaultPrevented: false }, plain), true);
  assert.equal(theaterEscapeShortcut({ key: "Escape", defaultPrevented: false }, null), true);
  assert.equal(theaterEscapeShortcut({ key: "Escape", defaultPrevented: true }, plain), false);
  assert.equal(theaterEscapeShortcut({ key: "Escape", defaultPrevented: false }, interactive), false);
  assert.equal(theaterEscapeShortcut({ key: "k", defaultPrevented: false }, plain), false);
});
