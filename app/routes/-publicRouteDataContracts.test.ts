import test from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";

import { getShareEssentialSpecs, getShareGrantedSpecs } from "./-share.data";

function names(specs: Array<{ query: unknown }>) {
  return specs.map((spec) => getFunctionName(spec.query as never)).sort();
}

test("public route data contracts expose the expected share queries", () => {
  assert.deepEqual(names(getShareEssentialSpecs({ token: "share_123" })), [
    "shareLinks:getByToken",
  ]);

  assert.deepEqual(names(getShareGrantedSpecs({ grantToken: "grant_123" })), [
    "comments:getThreadedForShareGrant",
    "reactions:listForShareGrant",
    "videos:getByShareGrant",
  ]);
});
