import { expect, test } from "bun:test";
import { artifactName, decide } from "../artifact-autodeploy.mjs";

const sha = "a".repeat(40);

test("artifact name matches the CI upload name", () => {
  expect(artifactName("customer", sha)).toBe(`customer-${sha}`);
});

test("waits when CI has not produced an artifact", () => {
  expect(decide({ sha, deployedSha: null, artifact: null }).deploy).toBe(false);
});

test("skips an expired artifact", () => {
  expect(decide({ sha, deployedSha: null, artifact: { expired: true } }).deploy).toBe(false);
});

test("skips when the commit is already live, unless forced", () => {
  expect(decide({ sha, deployedSha: sha, artifact: { id: 1 } }).deploy).toBe(false);
  expect(decide({ sha, deployedSha: sha, artifact: { id: 1 }, force: true }).deploy).toBe(true);
});

test("deploys a new commit", () => {
  expect(decide({ sha, deployedSha: "b".repeat(40), artifact: { id: 1 } }).deploy).toBe(true);
});
