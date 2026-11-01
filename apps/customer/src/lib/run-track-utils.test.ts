import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore node:test runs this file with explicit .ts extension
import { formatClock, formatPace, liveDistanceKm, shouldKeepPoint } from "./run-track-utils.ts";

const p = (lat: number, t: number, accuracy: number | null = 8) => ({ lat, lng: 106.8, accuracy, t });

describe("run track utils", () => {
  it("drops inaccurate and too-frequent points", () => {
    assert.equal(shouldKeepPoint(undefined, p(-6.2, 0)), true);
    assert.equal(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 1000)), false);
    assert.equal(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 5000, 90)), false);
    assert.equal(shouldKeepPoint(p(-6.2, 0), p(-6.2001, 5000)), true);
  });
  it("computes live distance and ignores gaps and impossible jumps", () => {
    const pts = [p(-6.2, 0), p(-6.2 + 15 / 111320, 5000), p(-6.2 + 30 / 111320, 10000)];
    assert.ok(Math.abs(liveDistanceKm(pts) - 0.03) < 0.005);
    assert.equal(liveDistanceKm([p(-6.2, 0), p(-6.1, 5000)]), 0);
    assert.equal(liveDistanceKm([p(-6.2, 0), p(-6.19, 120000)]), 0);
  });
  it("formats pace and clock", () => {
    assert.equal(formatPace(372), "6:12");
    assert.equal(formatPace(null), "–");
    assert.equal(formatClock(75), "1:15");
    assert.equal(formatClock(3725), "1:02:05");
  });
});
