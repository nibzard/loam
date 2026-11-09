import assert from "node:assert/strict";
import test from "node:test";
import { Id } from "@convex/_generated/dataModel";

import { isProjectDataConsistent } from "./-project.data";

const projectA = "proj_aaa" as Id<"projects">;
const projectB = "proj_bbb" as Id<"projects">;

test("holds data back while the context or project is still loading", () => {
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: undefined }),
    false,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: projectA, project: undefined }),
    false,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: { _id: projectA } }),
    false,
  );
});

test("accepts a project document that matches the resolved context", () => {
  assert.equal(
    isProjectDataConsistent({
      resolvedProjectId: projectA,
      project: { _id: projectA },
    }),
    true,
  );
});

test("rejects a prewarmed or stale document for another project", () => {
  assert.equal(
    isProjectDataConsistent({
      resolvedProjectId: projectA,
      project: { _id: projectB },
    }),
    false,
  );
});

test("keeps a definitive not-found answer for the resolved context", () => {
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: projectA, project: null }),
    true,
  );
  assert.equal(
    isProjectDataConsistent({ resolvedProjectId: undefined, project: null }),
    false,
  );
});
