import { expect, test } from "bun:test";
import { artifactName, decide } from "../artifact-autodeploy.mjs";

const sha = "a".repeat(40);

test("artifact name carries app and commit", () => {
  expect(artifactName("customer", sha)).toBe(`customer-${sha}`);
});

test("waits when the artifact for this commit is not uploaded", () => {
  expect(decide({ sha, deployedSha: null, ready: false }).deploy).toBe(false);
});

test("skips when the commit is already live, unless forced", () => {
  expect(decide({ sha, deployedSha: sha, ready: true }).deploy).toBe(false);
  expect(decide({ sha, deployedSha: sha, ready: true, force: true }).deploy).toBe(true);
});

test("deploys a new commit", () => {
  expect(decide({ sha, deployedSha: "b".repeat(40), ready: true }).deploy).toBe(true);
});
