import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Footprints, Loader2, MapPinOff, Play, Square, XCircle } from "lucide-react";
import { abandonRunSession, finishRunSession, startRunSession, type RunSessionVerdict, type RunTrackPoint } from "@/lib/djiwa-run-client";
import { formatClock, formatPace, liveDistanceKm, shouldKeepPoint } from "@/lib/run-track-utils";

type Props = {
  customerSourceId: string;
  customerEmail: string | null;
  campaignId: string | null;
  onFinished: (verdict: RunSessionVerdict) => void;
  onShare?: (verdict: RunSessionVerdict) => void;
};
type Stored = { sessionId: string; startedAt: string; activityType: "running" | "walking"; points: RunTrackPoint[] };
type Phase = "idle" | "starting" | "tracking" | "finishing" | "result" | "no_gps" | "error";

const STORAGE_KEY = "djiwa-run-active-session";
const read = (): Stored | null => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { return null; } };
const write = (value: Stored | null) => { try { value ? localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) : localStorage.removeItem(STORAGE_KEY); } catch { /* storage full/blocked */ } };

export function RunTrackerPanel({ customerSourceId, customerEmail, campaignId, onFinished, onShare }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activityType, setActivityType] = useState<"running" | "walking">("running");
  const [points, setPoints] = useState<RunTrackPoint[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [verdict, setVerdict] = useState<RunSessionVerdict | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const pointsRef = useRef<RunTrackPoint[]>([]);
  const identity = { customerSourceId, customerEmail };

  const stopWatching = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    void wakeRef.current?.release().catch(() => undefined); wakeRef.current = null;
  }, []);

  const beginWatching = useCallback(() => {
    if (!("geolocation" in navigator)) { setPhase("no_gps"); return; }
    void (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((lock) => { wakeRef.current = lock; }).catch(() => undefined);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: RunTrackPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, t: pos.timestamp || Date.now() };
        if (!shouldKeepPoint(pointsRef.current[pointsRef.current.length - 1], next)) return;
        pointsRef.current = [...pointsRef.current, next];
        setPoints(pointsRef.current);
        const stored = read(); if (stored) write({ ...stored, points: pointsRef.current });
      },
      (error) => { if (error.code === 1) { stopWatching(); setPhase("no_gps"); setMessage("Izin lokasi ditolak."); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [stopWatching]);

  // Recover an interrupted session (reload, tab discard).
  useEffect(() => {
    const stored = read();
    if (!stored) return;
    sessionRef.current = stored.sessionId; pointsRef.current = stored.points; setPoints(stored.points);
    setActivityType(stored.activityType); setStartedAt(Date.parse(stored.startedAt)); setPhase("tracking"); beginWatching();
    return stopWatching;
  }, [beginWatching, stopWatching]);

  useEffect(() => { if (phase !== "tracking") return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [phase]);

  const start = async () => {
    if (!campaignId) return;
    if (!("geolocation" in navigator)) { setPhase("no_gps"); return; }
    setPhase("starting"); setMessage(null);
    try {
      const session = await startRunSession({ ...identity, campaignId, activityType, idempotencyKey: window.crypto.randomUUID() });
      sessionRef.current = session.id; pointsRef.current = []; setPoints([]); setVerdict(null);
      setStartedAt(Date.parse(session.started_at)); setNow(Date.now());
      write({ sessionId: session.id, startedAt: session.started_at, activityType, points: [] });
      setPhase("tracking"); beginWatching();
    } catch (error) {
      setPhase("error"); setMessage(error instanceof Error ? error.message : "Sesi belum dapat dimulai.");
    }
  };

  const finish = async () => {
    const sessionId = sessionRef.current; if (!sessionId) return;
    stopWatching(); setPhase("finishing"); setMessage(null);
    try {
      const result = await finishRunSession({ ...identity, sessionId, points: pointsRef.current });
      write(null); sessionRef.current = null; setVerdict(result); setPhase("result"); onFinished(result);
    } catch (error) {
      setPhase("error"); setMessage(error instanceof Error ? `${error.message} Data lari tersimpan di perangkat, coba kirim lagi.` : "Gagal mengirim hasil. Data lari tersimpan, coba lagi.");
    }
  };

  const cancel = async () => {
    const sessionId = sessionRef.current; stopWatching(); write(null); sessionRef.current = null; pointsRef.current = []; setPoints([]); setPhase("idle");
    if (sessionId) await abandonRunSession({ ...identity, sessionId }).catch(() => undefined);
  };

  const distance = liveDistanceKm(points);
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const pace = distance > 0.05 ? Math.round(elapsed / distance) : null;

  return (
    <section className="rounded-[26px] border border-border bg-card p-4 shadow-sm" aria-labelledby="run-tracker-title">
      <h2 id="run-tracker-title" className="text-sm font-black">{phase === "tracking" ? "Sedang berlari" : "Catat lari dengan GPS"}</h2>

      {phase === "idle" || phase === "starting" || phase === "error" ? <>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis aktivitas">
          {(["running", "walking"] as const).map((type) => <button key={type} type="button" role="radio" aria-checked={activityType === type} onClick={() => setActivityType(type)} className={`min-h-11 rounded-2xl border px-3 text-xs font-black ${activityType === type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{type === "running" ? "Lari" : "Jalan"}</button>)}
        </div>
        <button type="button" onClick={start} disabled={!campaignId || phase === "starting"} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">
          {phase === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Mulai {activityType === "running" ? "Lari" : "Jalan"}
        </button>
        {!campaignId ? <p className="mt-2 text-[11px] text-muted-foreground">Campaign belum aktif. Tracking tersedia saat campaign dibuka.</p> : <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Biarkan layar menyala saat berlari. Jarak dihitung ulang dan divalidasi server.</p>}
        {message ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{message}</p> : null}
      </> : null}

      {phase === "tracking" || phase === "finishing" ? <>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center" aria-live="off">
          <Metric value={distance.toFixed(2)} label="km" /><Metric value={formatPace(pace)} label="/km" /><Metric value={formatClock(elapsed)} label="waktu" />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{points.length < 2 ? "Mencari sinyal GPS…" : "GPS aktif"}</p>
        <button type="button" onClick={finish} disabled={phase === "finishing"} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-red-600 px-4 text-sm font-black text-white disabled:opacity-60">
          {phase === "finishing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Selesai
        </button>
        <button type="button" onClick={cancel} disabled={phase === "finishing"} className="mt-2 min-h-11 w-full rounded-[14px] text-xs font-bold text-muted-foreground">Batalkan sesi</button>
      </> : null}

      {phase === "result" && verdict ? <div className={`mt-3 rounded-2xl px-3 py-3 text-xs leading-relaxed ${verdict.status === "accepted" ? "bg-emerald-50 text-emerald-950" : verdict.status === "rejected" ? "bg-red-50 text-red-950" : "bg-amber-50 text-amber-950"}`} role="status">
        <div className="flex items-center gap-2 font-black">{verdict.status === "accepted" ? <CheckCircle2 className="h-4 w-4" /> : verdict.status === "rejected" ? <XCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{verdict.status === "accepted" ? "Lolos validasi" : verdict.status === "rejected" ? "Tidak dapat dicatat" : "Menunggu tinjauan admin"}</div>
        <p className="mt-1 text-lg font-black">{verdict.stats.distance_km.toFixed(2)} km · {formatClock(verdict.stats.duration_seconds)} · {formatPace(verdict.stats.pace_seconds_per_km)}/km</p>
        {verdict.reason ? <p className="mt-1">{verdict.reason}</p> : null}
        {verdict.rewards?.credited?.length ? <p className="mt-1 font-black">Reward masuk saldo: Rp{verdict.rewards.credited.reduce((n, r) => n + r.amount, 0).toLocaleString("id-ID")}</p> : null}
        <div className="mt-3 flex gap-2">
          {verdict.status === "accepted" && onShare ? <button type="button" onClick={() => onShare(verdict)} className="min-h-11 flex-1 rounded-[14px] bg-primary px-3 text-xs font-black text-primary-foreground">Bagikan ke Komunitas</button> : null}
          <button type="button" onClick={() => { setPhase("idle"); setVerdict(null); }} className="min-h-11 flex-1 rounded-[14px] border border-border bg-card px-3 text-xs font-black">Lari lagi</button>
        </div>
      </div> : null}

      {phase === "no_gps" ? <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950" role="alert">
        <div className="flex items-center gap-2 font-black"><MapPinOff className="h-4 w-4" /> GPS tidak tersedia</div>
        <p className="mt-1">{message ?? "Perangkat atau browser tidak mendukung lokasi."} Kamu tetap bisa mencatat lari dengan screenshot dari aplikasi olahraga di bawah.</p>
        <a href="#run-manual" className="mt-2 inline-flex min-h-11 items-center gap-2 font-black underline"><Footprints className="h-4 w-4" /> Catat manual</a>
      </div> : null}
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-muted/40 px-2 py-3"><p className="text-xl font-black tabular-nums">{value}</p><p className="text-[10px] font-bold text-muted-foreground">{label}</p></div>;
}
