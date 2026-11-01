// Pure GPS session validation. No imports so it runs in Deno (edge) and Node (tests).
export type RunPoint = { lat: number; lng: number; accuracy?: number | null; t: number }; // t = epoch ms
export type ActivityType = "running" | "walking";
export type GpsFlag = "SPEED" | "PACE" | "TELEPORT" | "COVERAGE" | "TIME_SPOOF" | "SHORT" | "LONG" | "DURATION" | "TIMESTAMPS" | "FEW_POINTS";
export type GpsVerdict = {
  status: "accepted" | "review" | "rejected";
  flags: GpsFlag[];
  reason?: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
  validPoints: number;
  totalPoints: number;
};

export const RULES = {
  maxAccuracyM: 50, maxGapMs: 60_000, minDistanceKm: 0.3, maxDistanceKm: 42,
  minDurationS: 180, maxDurationS: 4 * 3600, serverToleranceMs: 30_000,
  maxSpeedMps: { running: 7, walking: 3 } as Record<ActivityType, number>,
  paceRange: { running: [180, 900], walking: [360, 1200] } as Record<ActivityType, [number, number]>,
  teleportM: 200, teleportMs: 2000, minCoverage: 0.8, minPoints: 10, maxSessionsPerDay: 3, maxKmPerDay: 15,
};

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validateGpsSession(input: {
  points: RunPoint[]; activityType: ActivityType; startedAtMs: number; nowMs: number;
}): GpsVerdict {
  const { activityType, startedAtMs, nowMs } = input;
  const empty = (flags: GpsFlag[], reason: string, status: GpsVerdict["status"] = "review"): GpsVerdict =>
    ({ status, flags, reason, distanceKm: 0, durationSeconds: 0, paceSecondsPerKm: null, validPoints: 0, totalPoints: input.points.length });
  const raw = input.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.t)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  // Hard timestamp rules: strictly increasing and inside the server-known session window.
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && raw[i].t <= raw[i - 1].t) return empty(["TIMESTAMPS"], "Urutan waktu titik GPS tidak valid", "rejected");
    if (raw[i].t < startedAtMs - RULES.serverToleranceMs || raw[i].t > nowMs + RULES.serverToleranceMs)
      return empty(["TIMESTAMPS"], "Waktu titik GPS di luar sesi", "rejected");
  }
  const pts = raw.filter((p) => p.accuracy == null || p.accuracy <= RULES.maxAccuracyM);
  if (pts.length < RULES.minPoints) return empty(["FEW_POINTS"], "Titik GPS valid terlalu sedikit");

  const flags = new Set<GpsFlag>();
  let meters = 0, movingMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt > RULES.maxGapMs) continue; // gap breaks the segment; never interpolate
    const d = haversineM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    if (d > RULES.teleportM && dt <= RULES.teleportMs) { flags.add("TELEPORT"); continue; }
    if (d / (dt / 1000) > RULES.maxSpeedMps[activityType]) { flags.add("SPEED"); continue; }
    meters += d; movingMs += dt;
  }
  const spanMs = pts[pts.length - 1].t - pts[0].t;
  const durationSeconds = Math.round(spanMs / 1000);
  const distanceKm = Math.round((meters / 1000) * 100) / 100;
  const expected = Math.max(1, Math.floor(spanMs / 5000)); // ~1 sample / 5 s
  if (pts.length / expected < RULES.minCoverage && movingMs / spanMs < RULES.minCoverage) flags.add("COVERAGE");
  if (durationSeconds < RULES.minDurationS || durationSeconds > RULES.maxDurationS) flags.add("DURATION");
  if (spanMs > nowMs - startedAtMs + RULES.serverToleranceMs) flags.add("TIME_SPOOF");
  if (distanceKm < RULES.minDistanceKm) flags.add("SHORT");
  if (distanceKm > RULES.maxDistanceKm) flags.add("LONG");
  const pace = distanceKm > 0 ? Math.round(durationSeconds / distanceKm) : null;
  const [minPace, maxPace] = RULES.paceRange[activityType];
  if (pace != null && (pace < minPace || pace > maxPace)) flags.add("PACE");

  const list = [...flags];
  const hard = list.includes("SHORT");
  return {
    status: hard ? "rejected" : list.length ? "review" : "accepted", flags: list,
    reason: hard ? "Jarak terlalu pendek untuk dicatat" : list.length ? "Perlu ditinjau admin" : undefined,
    distanceKm, durationSeconds, paceSecondsPerKm: pace, validPoints: pts.length, totalPoints: input.points.length,
  };
}

export function dailyCapVerdict(input: { sessionsToday: number; kmToday: number; newKm: number }): { ok: boolean; reason?: string } {
  if (input.sessionsToday >= RULES.maxSessionsPerDay) return { ok: false, reason: "Batas 3 sesi per hari tercapai" };
  if (input.kmToday + input.newKm > RULES.maxKmPerDay) return { ok: false, reason: "Batas 15 km per hari tercapai" };
  return { ok: true };
}
