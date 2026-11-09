import assert from "node:assert/strict";
import test from "node:test";

import { pickCurrentTeam } from "./currentTeam";

const teams = [
  { _id: "team_a", slug: "alpha", name: "Alpha" },
  { _id: "team_b", slug: "bravo", name: "Bravo" },
  { _id: "team_c", slug: "charlie", name: "Charlie" },
];

test("pickCurrentTeam prefers the route slug over every other source", () => {
  assert.equal(pickCurrentTeam(teams, "bravo", "charlie")?.slug, "bravo");
});

test("pickCurrentTeam falls back to the last picked team off team routes", () => {
  assert.equal(pickCurrentTeam(teams, undefined, "charlie")?.slug, "charlie");
});

test("pickCurrentTeam falls back to the first team when nothing matches", () => {
  assert.equal(pickCurrentTeam(teams, undefined, "delta")?._id, "team_a");
  assert.equal(pickCurrentTeam(teams, undefined, undefined)?._id, "team_a");
});

test("pickCurrentTeam returns undefined when the user has no teams", () => {
  assert.equal(pickCurrentTeam([], "alpha", "alpha"), undefined);
});
