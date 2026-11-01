import { useCallback, useEffect, useRef, useState } from "react";
import { abandonRunSession, finishRunSession, startRunSession, type RunSessionVerdict, type RunTrackPoint } from "@/lib/djiwa-run-client";
import { liveDistanceKm, shouldKeepPoint } from "@/lib/run-track-utils";

export type TrackerPhase = "idle" | "starting" | "tracking" | "paused" | "finishing" | "no_gps" | "error";
type Stored = { sessionId: string; startedAt: string; activityType: "running" | "walking"; points: RunTrackPoint[]; pausedMs: number; pausedAt: number | null };
type WakeLockLike = { release: () => Promise<void> };

const STORAGE_KEY = "djiwa-run-active-session";
const readStored = (): Stored | null => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { return null; } };
const writeStored = (value: Stored | null) => { try { value ? localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) : localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ } };

type Args = { customerSourceId: string | null; customerEmail: string | null; campaignId: string | null; onFinished: (verdict: RunSessionVerdict) => void };

export function useRunTracker({ customerSourceId, customerEmail, campaignId, onFinished }: Args) {
  const [phase, setPhase] = useState<TrackerPhase>("idle");
  const [activityType, setActivityType] = useState<"running" | "walking">("running");
  const [points, setPoints] = useState<RunTrackPoint[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<RunSessionVerdict | null>(null);
  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef<number | null>(null);
  const pausedMsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pointsRef = useRef<RunTrackPoint[]>([]);
  const typeRef = useRef<"running" | "walking">("running");
  const startedIso = useRef<string>("");
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockLike | null>(null);

  const persist = useCallback(() => {
    if (!sessionRef.current) return;
    writeStored({ sessionId: sessionRef.current, startedAt: startedIso.current, activityType: typeRef.current, points: pointsRef.current, pausedMs: pausedMsRef.current, pausedAt: pausedAtRef.current });
  }, []);

  const stopWatching = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    void wakeRef.current?.release().catch(() => undefined); wakeRef.current = null;
  }, []);

  const beginWatching = useCallback(() => {
    if (!("geolocation" in navigator)) { setPhase("no_gps"); return; }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } };
    void nav.wakeLock?.request("screen").then((lock) => { wakeRef.current = lock; }).catch(() => undefined);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: RunTrackPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, t: pos.timestamp || Date.now() };
        if (!shouldKeepPoint(pointsRef.current[pointsRef.current.length - 1], next)) return;
        pointsRef.current = [...pointsRef.current, next]; setPoints(pointsRef.current); persist();
      },
      (error) => { if (error.code === 1) { stopWatching(); setMessage("Izin lokasi ditolak."); setPhase("no_gps"); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [persist, stopWatching]);

  useEffect(() => {
    const stored = readStored(); if (!stored) return;
    sessionRef.current = stored.sessionId; startedRef.current = Date.parse(stored.startedAt); startedIso.current = stored.startedAt;
    typeRef.current = stored.activityType; setActivityType(stored.activityType);
    pointsRef.current = stored.points; setPoints(stored.points); pausedMsRef.current = stored.pausedMs; pausedAtRef.current = stored.pausedAt;
    if (stored.pausedAt) setPhase("paused"); else { setPhase("tracking"); beginWatching(); }
    return stopWatching;
  }, [beginWatching, stopWatching]);

  useEffect(() => { if (phase !== "tracking" && phase !== "paused") return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [phase]);

  const identity = { customerSourceId: customerSourceId ?? "", customerEmail };

  const start = useCallback(async (type: "running" | "walking" = "running") => {
    if (!campaignId || !customerSourceId) return;
    if (!("geolocation" in navigator)) { setPhase("no_gps"); return; }
    setPhase("starting"); setMessage(null); setVerdict(null); typeRef.current = type; setActivityType(type);
    try {
      const session = await startRunSession({ ...identity, campaignId, activityType: type, idempotencyKey: window.crypto.randomUUID() });
      sessionRef.current = session.id; startedIso.current = session.started_at; startedRef.current = Date.parse(session.started_at);
      pointsRef.current = []; setPoints([]); pausedMsRef.current = 0; pausedAtRef.current = null; setNow(Date.now());
      persist(); setPhase("tracking"); beginWatching();
    } catch (error) { setPhase("error"); setMessage(error instanceof Error ? error.message : "Sesi belum dapat dimulai."); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, customerSourceId, customerEmail, beginWatching, persist]);

  const pause = useCallback(() => { stopWatching(); pausedAtRef.current = Date.now(); persist(); setPhase("paused"); }, [persist, stopWatching]);
  const resume = useCallback(() => {
    if (pausedAtRef.current) pausedMsRef.current += Date.now() - pausedAtRef.current;
    pausedAtRef.current = null; persist(); setPhase("tracking"); beginWatching();
  }, [beginWatching, persist]);

  const finish = useCallback(async () => {
    const sessionId = sessionRef.current; if (!sessionId) return null;
    stopWatching(); setPhase("finishing"); setMessage(null);
    try {
      const result = await finishRunSession({ ...identity, sessionId, points: pointsRef.current });
      writeStored(null); sessionRef.current = null; setVerdict(result); setPhase("idle"); onFinished(result); return result;
    } catch (error) {
      setPhase("error"); setMessage(error instanceof Error ? `${error.message} Data lari tersimpan di perangkat, coba kirim lagi.` : "Gagal mengirim hasil. Data lari tersimpan, coba lagi."); return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSourceId, customerEmail, onFinished, stopWatching]);

  const cancel = useCallback(async () => {
    const sessionId = sessionRef.current; stopWatching(); writeStored(null); sessionRef.current = null; pointsRef.current = []; setPoints([]); setPhase("idle");
    if (sessionId) await abandonRunSession({ ...identity, sessionId }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSourceId, customerEmail, stopWatching]);

  const reference = phase === "paused" && pausedAtRef.current ? pausedAtRef.current : now;
  const elapsedSeconds = startedRef.current ? Math.max(0, (reference - startedRef.current - pausedMsRef.current) / 1000) : 0;
  const distanceKm = liveDistanceKm(points);
  const paceSecondsPerKm = distanceKm > 0.05 ? Math.round(elapsedSeconds / distanceKm) : null;
  const active = phase === "tracking" || phase === "paused" || phase === "finishing";
  return { phase, active, activityType, points, message, verdict, distanceKm, elapsedSeconds, paceSecondsPerKm, start, pause, resume, finish, cancel, clearVerdict: () => setVerdict(null), accuracy: points.length ? points[points.length - 1].accuracy : null };
}
