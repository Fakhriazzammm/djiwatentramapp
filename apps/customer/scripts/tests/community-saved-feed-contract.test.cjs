const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const routePath = path.join(__dirname, "../../src/routes/$username/komunitas.lazy.tsx");
const source = fs.readFileSync(routePath, "utf8");

function getSavedRequestEffect() {
  const requestIndex = source.indexOf("void communityClient.listSaved()");
  assert.notEqual(requestIndex, -1, "saved feed request should exist");
  const start = source.lastIndexOf("  useEffect(() => {", requestIndex);
  const end = source.indexOf("\n  useEffect(", requestIndex);
  assert.notEqual(start, -1, "saved feed effect should exist");
  assert.notEqual(end, -1, "saved feed effect should close before the next effect");
  return source.slice(start, end);
}

function extractBody(effect, startMarker, endMarker) {
  const markerIndex = effect.indexOf(startMarker);
  assert.notEqual(markerIndex, -1, `missing callback ${startMarker}`);
  const bodyStart = markerIndex + startMarker.length;
  const bodyEnd = effect.indexOf(endMarker, bodyStart);
  assert.notEqual(bodyEnd, -1, `missing callback terminator ${endMarker}`);
  return effect.slice(bodyStart, bodyEnd);
}

test("saved feed loading state cannot retrigger the request effect", () => {
  const effect = getSavedRequestEffect();
  const dependencyList = effect.match(/}, \[(.*?)\]\);/s)?.[1];
  assert.ok(dependencyList, "request effect dependencies should be explicit");
  assert.match(dependencyList, /currentSavedFeedOwner/);
  assert.doesNotMatch(dependencyList, /\bsavedLoading\b/);
  assert.match(effect, /savedPostsLoadedForRef\.current === customerSourceId/);
  assert.match(effect, /savedPostsRequestForRef\.current\.requestId === savedPostsRequestIdRef\.current/);
});

test("owner reset effect is declared before the replacement request effect", () => {
  const resetMarker = source.indexOf("if (savedFeedOwnerRef.current === currentSavedFeedOwner) return;");
  const requestMarker = source.indexOf("void communityClient.listSaved()");
  assert.notEqual(resetMarker, -1);
  assert.notEqual(requestMarker, -1);
  const resetEffectStart = source.lastIndexOf("  useEffect(() => {", resetMarker);
  const requestEffectStart = source.lastIndexOf("  useEffect(() => {", requestMarker);
  assert.ok(resetEffectStart < requestEffectStart, "React must invalidate/clear the old owner before the new-owner request effect runs");
});

test("saved posts are synchronously hidden when the active customer changes", () => {
  const ownerExpression = source.match(/const currentSavedFeedOwner = (.*);/)?.[1];
  const visibleExpression = source.match(/const visibleSavedPosts = (.*);/)?.[1];
  assert.ok(ownerExpression, "current authenticated owner should be derived during render");
  assert.ok(visibleExpression, "saved posts should be gated during render");
  const getOwner = new Function("isAuthenticated", "customer", `return ${ownerExpression};`);
  const getVisible = new Function("savedPostsOwner", "currentSavedFeedOwner", "savedPosts", `return ${visibleExpression};`);
  const postsA = [{ id: "customer-a-post" }];
  assert.equal(getOwner(false, { sourceId: "customer-a" }), null);
  assert.equal(getVisible("customer-a", null, postsA), null);
  assert.equal(getVisible("customer-a", "customer-b", postsA), null);
  assert.strictEqual(getVisible("customer-a", "customer-a", postsA), postsA);
});

test("stale generations after logout, account switch, and same-owner re-login are ignored", () => {
  const effect = getSavedRequestEffect();
  const thenBody = extractBody(effect, ".then((page) => {", "\n      })");
  const catchBody = extractBody(effect, ".catch((reason) => {", "\n      })\n      .finally");
  const finallyBody = extractBody(effect, ".finally(() => {", "\n      });");
  const applyResult = new Function("page", "savedFeedOwnerRef", "customerSourceId", "savedPostsRequestIdRef", "requestId", "setSavedPosts", "setSavedPostsOwner", "savedPostsLoadedForRef", thenBody);
  const applyError = new Function("reason", "savedFeedOwnerRef", "customerSourceId", "savedPostsRequestIdRef", "requestId", "setNotice", catchBody);
  const finishRequest = new Function("savedPostsRequestForRef", "requestId", "savedFeedOwnerRef", "customerSourceId", "savedPostsRequestIdRef", "setSavedLoading", finallyBody);
  const oldRequestId = 1;
  const scenarios = [
    { name: "logout", owner: null, generation: 2, request: null },
    { name: "account switch", owner: "customer-b", generation: 3, request: { ownerId: "customer-b", requestId: 3 } },
    { name: "same-owner re-login", owner: "customer-a", generation: 3, request: { ownerId: "customer-a", requestId: 3 } },
  ];
  for (const scenario of scenarios) {
    const writes = { posts: 0, postOwner: 0, notices: 0, loading: 0 };
    const ownerRef = { current: scenario.owner };
    const generationRef = { current: scenario.generation };
    const requestRef = { current: scenario.request };
    const loadedRef = { current: null };
    applyResult({ data: [{ id: "private-to-customer-a" }] }, ownerRef, "customer-a", generationRef, oldRequestId, () => writes.posts++, () => writes.postOwner++, loadedRef);
    applyError(new Error("stale response"), ownerRef, "customer-a", generationRef, oldRequestId, () => writes.notices++);
    finishRequest(requestRef, oldRequestId, ownerRef, "customer-a", generationRef, () => writes.loading++);
    assert.deepEqual(writes, { posts: 0, postOwner: 0, notices: 0, loading: 0 }, scenario.name);
    assert.equal(loadedRef.current, null, scenario.name);
    assert.deepEqual(requestRef.current, scenario.request, scenario.name);
  }
});

test("the active generation applies results and only clears its own request", () => {
  const effect = getSavedRequestEffect();
  const thenBody = extractBody(effect, ".then((page) => {", "\n      })");
  const finallyBody = extractBody(effect, ".finally(() => {", "\n      });");
  const applyResult = new Function("page", "savedFeedOwnerRef", "customerSourceId", "savedPostsRequestIdRef", "requestId", "setSavedPosts", "setSavedPostsOwner", "savedPostsLoadedForRef", thenBody);
  const finishRequest = new Function("savedPostsRequestForRef", "requestId", "savedFeedOwnerRef", "customerSourceId", "savedPostsRequestIdRef", "setSavedLoading", finallyBody);
  const writes = { posts: 0, postOwner: 0, loading: 0 };
  const ownerRef = { current: "customer-a" };
  const generationRef = { current: 5 };
  const requestRef = { current: { ownerId: "customer-a", requestId: 5 } };
  const loadedRef = { current: null };
  applyResult({ data: [{ id: "customer-a-post" }] }, ownerRef, "customer-a", generationRef, 5, () => writes.posts++, () => writes.postOwner++, loadedRef);
  finishRequest(requestRef, 5, ownerRef, "customer-a", generationRef, () => writes.loading++);
  assert.deepEqual(writes, { posts: 1, postOwner: 1, loading: 1 });
  assert.equal(loadedRef.current, "customer-a");
  assert.equal(requestRef.current, null);
});

test("owner transition increments generation and clears the prior customer's cache", () => {
  const resetIndex = source.indexOf("if (savedFeedOwnerRef.current === currentSavedFeedOwner) return;");
  assert.notEqual(resetIndex, -1, "owner transition effect should exist");
  const start = source.lastIndexOf("  useEffect(() => {", resetIndex);
  const end = source.indexOf("\n  useEffect(", resetIndex);
  const resetEffect = source.slice(start, end);
  const resetBody = extractBody(resetEffect, "useEffect(() => {", "}, [currentSavedFeedOwner]);");
  const reset = new Function("currentSavedFeedOwner", "savedFeedOwnerRef", "savedPostsRequestIdRef", "savedPostsLoadedForRef", "savedPostsRequestForRef", "setSavedPosts", "setSavedPostsOwner", "setSavedLoading", resetBody);
  const calls = { posts: 0, owner: 0, loading: 0 };
  const ownerRef = { current: "customer-a" };
  const generationRef = { current: 7 };
  const loadedRef = { current: "customer-a" };
  const requestRef = { current: { ownerId: "customer-a", requestId: 7 } };
  reset(null, ownerRef, generationRef, loadedRef, requestRef, () => calls.posts++, () => calls.owner++, () => calls.loading++);
  assert.equal(ownerRef.current, null);
  assert.equal(generationRef.current, 8);
  assert.equal(loadedRef.current, null);
  assert.equal(requestRef.current, null);
  assert.deepEqual(calls, { posts: 1, owner: 1, loading: 1 });
});
