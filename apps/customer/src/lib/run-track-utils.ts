import type { RunTrackPoint } from "@/lib/djiwa-run-client";

export const TRACK = { maxAccuracyM: 50, minIntervalMs: 3000, minMoveM: 3 } as const;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Decide whether a new browser position should be buffered. Server re-validates everything. */
export function shouldKeepPoint(prev: RunTrackPoint | undefined, next: RunTrackPoint) {
  if (next.accuracy != null && next.accuracy > TRACK.maxAccuracyM) return false;
  if (!prev) return true;
  if (next.t - prev.t < TRACK.minIntervalMs) return false;
  return haversineM(prev.lat, prev.lng, next.lat, next.lng) >= TRACK.minMoveM || next.t - prev.t >= 15000;
}

/** Display-only distance; the authoritative distance is computed server-side. */
export function liveDistanceKm(points: RunTrackPoint[]) {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt > 60_000) continue;
    const d = haversineM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    if (d / (dt / 1000) > 7) continue;
    m += d;
  }
  return m / 1000;
}

export function formatPace(secondsPerKm: number | null) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return "–";
  return `${Math.floor(secondsPerKm / 60)}:${String(Math.round(secondsPerKm % 60)).padStart(2, "0")}`;
}
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
