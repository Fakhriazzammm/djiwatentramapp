import { validateGpsSession, dailyCapVerdict, type RunPoint } from "./gps-validation.ts";
import test from "node:test";
import assert from "node:assert/strict";

const START = Date.UTC(2026, 10, 1, 0, 0, 0);
// Straight line heading north at `mps` m/s, one point / 5 s.
function track(mps: number, seconds: number, opts: { accuracy?: number } = {}): RunPoint[] {
  const out: RunPoint[] = [];
  for (let s = 0; s <= seconds; s += 5) out.push({ lat: -6.2 + (mps * s) / 111_320, lng: 106.8, accuracy: opts.accuracy ?? 8, t: START + s * 1000 });
  return out;
}
const now = (seconds: number) => START + seconds * 1000 + 1000;

test("normal 5k-ish run is accepted", () => {
  const v = validateGpsSession({ points: track(3, 1800), activityType: "running", startedAtMs: START, nowMs: now(1800) });
  assert.equal(v.status, "accepted"); assert.ok(v.distanceKm > 5 && v.distanceKm < 5.6);
});
test("vehicle speed is flagged for review", () => {
  const v = validateGpsSession({ points: track(15, 900), activityType: "running", startedAtMs: START, nowMs: now(900) });
  assert.notEqual(v.status, "accepted"); assert.ok(v.flags.includes("SPEED") || v.flags.includes("PACE"));
});
test("duration longer than server elapsed time is rejected as TIME_SPOOF/TIMESTAMPS", () => {
  const v = validateGpsSession({ points: track(3, 1800), activityType: "running", startedAtMs: START, nowMs: now(600) });
  assert.equal(v.status, "rejected");
});
test("non-increasing timestamps rejected", () => {
  const pts = track(3, 300); pts[5].t = pts[4].t;
  assert.equal(validateGpsSession({ points: pts, activityType: "running", startedAtMs: START, nowMs: now(400) }).status, "rejected");
});
test("poor accuracy points are dropped, too few left goes to review", () => {
  const v = validateGpsSession({ points: track(3, 600, { accuracy: 120 }), activityType: "running", startedAtMs: START, nowMs: now(600) });
  assert.equal(v.status, "review"); assert.ok(v.flags.includes("FEW_POINTS"));
});
test("very short distance rejected", () => {
  const v = validateGpsSession({ points: track(0.3, 300), activityType: "walking", startedAtMs: START, nowMs: now(300) });
  assert.equal(v.status, "rejected");
});
test("teleport jump flagged", () => {
  const pts = track(3, 600); pts[60] = { ...pts[60], lat: pts[60].lat + 0.05 };
  const v = validateGpsSession({ points: pts, activityType: "running", startedAtMs: START, nowMs: now(600) });
  assert.ok(v.flags.includes("SPEED") || v.flags.includes("TELEPORT")); // 5 s sampling → SPEED catches it
  assert.notEqual(v.status, "accepted");
});
test("dense samples: 300 m in 1 s is TELEPORT", () => {
  const pts = track(3, 600); pts.splice(10, 0, { lat: pts[9].lat + 0.003, lng: 106.8, accuracy: 8, t: pts[9].t + 1000 });
  const v = validateGpsSession({ points: pts, activityType: "running", startedAtMs: START, nowMs: now(600) });
  assert.ok(v.flags.includes("TELEPORT"));
});
test("pause: a 5 minute pause is excluded from duration and pace", () => {
  const a = track(3, 900); const b = track(3, 900).map((p) => ({ ...p, lat: p.lat + 0.03, t: p.t + 1200 * 1000 }));
  const v = validateGpsSession({ points: [...a, ...b], activityType: "running", startedAtMs: START, nowMs: START + 2200 * 1000 });
  assert.equal(v.status, "accepted"); assert.ok(v.durationSeconds >= 1790 && v.durationSeconds <= 1810); assert.ok((v.paceSecondsPerKm ?? 0) < 420);
});
test("daily caps", () => {
  assert.equal(dailyCapVerdict({ sessionsToday: 3, kmToday: 1, newKm: 1 }).ok, false);
  assert.equal(dailyCapVerdict({ sessionsToday: 1, kmToday: 14, newKm: 2 }).ok, false);
  assert.equal(dailyCapVerdict({ sessionsToday: 1, kmToday: 5, newKm: 5 }).ok, true);
});
