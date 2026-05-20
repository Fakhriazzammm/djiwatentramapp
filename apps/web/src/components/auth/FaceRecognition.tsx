import { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import Webcam from "react-webcam";
import { Loader2, Camera, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface FaceRecognitionProps {
  onMatch?: (d: number[]) => void;
  onVerify?: (d: number[]) => Promise<void> | void;
  onCapture?: (d: number[]) => void;
  onModelError?: (e: string) => void;
  targetDescriptor?: number[];
  mode: "enroll" | "verify";
  className?: string;
}

const MODEL_CDN =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
const CANDIDATES = (() => {
  const b = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return [...new Set([`${b}/models`, "/models", MODEL_CDN].map((p) =>
    p.startsWith("http") ? p : "/" + p.replace(/\/+/g, "/").replace(/^\/*/, "")
  ))];
})();

async function canReach(p: string) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const r = await fetch(`${p}/tiny_face_detector_model-weights_manifest.json`, {
      method: "GET", cache: "force-cache", signal: c.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export function FaceRecognition({
  onMatch, onVerify, onCapture, onModelError,
  targetDescriptor, mode, className = "",
}: FaceRecognitionProps) {
  const wRef = useRef<Webcam>(null);
  const dRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pRef = useRef(false);
  const lRef = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [lMsg, setLMsg] = useState("Memuat sistem biometrik...");
  const [err, setErr] = useState<string | null>(null);
  const [st, setSt] = useState<"idle" | "scanning" | "success" | "fail">("idle");
  const [face, setFace] = useState(false);
  const [r, setR] = useState(0);

  // Load models
  useEffect(() => {
    if (lRef.current) return;
    lRef.current = true;
    let cancelled = false;
    const load = async () => {
      setErr(null);
      setLoaded(false);
      setLMsg("Memuat sistem biometrik...");
      const gt = setTimeout(() => {
        if (!cancelled) { setErr("Waktu pemuatan habis."); onModelError?.("Waktu pemuatan habis."); }
      }, 20000);

      for (const cp of CANDIDATES) {
        if (!cp.startsWith("http") && !(await canReach(cp))) continue;
        try {
          setLMsg("Memuat Detektor...");
          await faceapi.nets.tinyFaceDetector.loadFromUri(cp);
          setLMsg("Memuat Landmark...");
          await faceapi.nets.faceLandmark68Net.loadFromUri(cp);
          setLMsg("Memuat Pengenalan...");
          await faceapi.nets.faceRecognitionNet.loadFromUri(cp);
          if (!cancelled) { clearTimeout(gt); setLoaded(true); setLMsg(""); }
          return;
        } catch (e) { console.warn(`Load fail ${cp}:`, e); }
      }
      if (!cancelled) { clearTimeout(gt); setErr("Gagal memuat. Gunakan PIN."); onModelError?.("Gagal memuat. Gunakan PIN."); }
    };
    load();
    return () => { cancelled = true; };
  }, [r]);

  // Face detection loop
  useEffect(() => {
    if (!loaded || st !== "idle") return;
    const detect = async () => {
      if (!wRef.current?.video || pRef.current) return;
      try {
        const det = await faceapi
          .detectSingleFace(wRef.current.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 }))
          .withFaceLandmarks();
        setFace(!!det);
      } catch { /* silent */ }
    };
    dRef.current = setInterval(detect, 300);
    return () => { if (dRef.current) clearInterval(dRef.current); };
  }, [loaded, st]);

  const capture = useCallback(async () => {
    if (!wRef.current || !loaded || pRef.current) return;
    pRef.current = true;
    if (dRef.current) { clearInterval(dRef.current); dRef.current = null; }
    setSt("scanning");
    try {
      const video = wRef.current.video;
      if (!video) throw new Error("no video");
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!det) { setSt("fail"); setFace(false); return; }
      const desc = Array.from(det.descriptor);
      if (mode === "enroll") { onCapture?.(desc); setSt("success"); }
      else if (mode === "verify" && onVerify) { await onVerify(desc); setSt("success"); onMatch?.(desc); }
      else if (mode === "verify" && targetDescriptor) {
        const d = faceapi.euclideanDistance(new Float32Array(desc), new Float32Array(targetDescriptor));
        d < 0.6 ? (setSt("success"), onMatch?.(desc)) : setSt("fail");
      } else { setSt("fail"); if (mode === "verify" && !targetDescriptor) onModelError?.("Data wajah tidak tersedia."); }
    } catch (err) { console.error(err); setSt("fail"); }
    finally { pRef.current = false; }
  }, [loaded, mode, targetDescriptor, onMatch, onVerify, onCapture, onModelError]);

  const retry = () => { setSt("idle"); setFace(false); };
  const reload = () => { setErr(null); setLoaded(false); lRef.current = false; setR((c) => c + 1); };

  const frameColor = face ? "rgba(16,185,129,0.7)" : st === "scanning" ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.25)";
  const frameGlow = face ? "0 0 20px rgba(16,185,129,0.2)" : st === "scanning" ? "0 0 20px rgba(59,130,246,0.2)" : "none";

  return (
    <div className={`flex flex-col items-center gap-5 ${className}`}>
      <div className="relative w-full max-w-xs overflow-hidden rounded-[2rem] bg-black shadow-2xl ring-1 ring-border/20" style={{ aspectRatio: "4/5" }}>
        {/* Loading */}
        {!loaded && !err && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-primary/20 blur-lg animate-pulse" />
              <Loader2 className="relative h-10 w-10 animate-spin text-primary" />
            </div>
            <p className="mt-4 text-sm font-bold text-white">{lMsg}</p>
          </motion.div>
        )}

        {/* Error */}
        {err && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-950/90 p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400" />
            <p className="mt-3 text-sm font-bold text-red-300">{err}</p>
            <Button className="mt-5 rounded-2xl" onClick={reload} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" /> Muat Ulang
            </Button>
          </motion.div>
        )}

        {/* Webcam */}
        <Webcam audio={false} mirrored={false} ref={wRef} screenshotFormat="image/jpeg"
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[110%] w-full object-cover scale-x-[-1]"
          videoConstraints={{ width: { ideal: 480 }, height: { ideal: 640 }, facingMode: "user" }}
        />

        {/* Vignette */}
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 55% 60% at 50% 45%, transparent 0%, transparent 60%, rgba(0,0,0,0.7) 100%)" }}
        />

        {/* Oval frame — pure CSS */}
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-[60%] h-[62%] rounded-[50%] border-2 transition-colors duration-300"
            style={{ borderColor: frameColor, boxShadow: frameGlow }} />
        </div>

        {/* Face indicator */}
        {loaded && st === "idle" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md border transition-all duration-300 ${
              face ? "bg-emerald-500/20 border-emerald-500/30" : "bg-white/10 border-white/20"
            }`}>
              <span className={`h-2 w-2 rounded-full ${face ? "bg-emerald-400 animate-pulse" : "bg-white/40"}`} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                {face ? "Wajah Terdeteksi" : "Arahkan Wajah ke Kamera"}
              </span>
            </div>
          </div>
        )}

        {/* Scanning */}
        {st === "scanning" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-2 rounded-full bg-blue-500/20 px-4 py-2 backdrop-blur-md border border-blue-500/30">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <span className="text-xs font-bold text-blue-300">Memindai Wajah...</span>
            </div>
          </div>
        )}

        {/* Success */}
        <AnimatePresence>
          {st === "success" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[3px]" />
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/40">
                <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
              </motion.div>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="relative mt-4 text-lg font-black text-white uppercase tracking-wide">Berhasil!</motion.p>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="relative mt-1 text-sm text-emerald-200">
                {mode === "enroll" ? "Wajah berhasil didaftarkan!" : "Absensi berhasil — selamat bekerja!"}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fail */}
        <AnimatePresence>
          {st === "fail" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[3px]" />
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 shadow-2xl shadow-red-500/40">
                <XCircle className="h-12 w-12 text-white" strokeWidth={2.5} />
              </motion.div>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="relative mt-4 text-lg font-black text-white uppercase tracking-wide">
                {face ? "Wajah Tidak Cocok" : "Tidak Terdeteksi"}
              </motion.p>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="relative mt-2 text-sm text-red-200">
                {face ? "Wajah tidak dikenali — coba lagi" : "Arahkan wajah ke kamera"}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="relative mt-5">
                <Button onClick={retry}
                  className="rounded-2xl bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-md h-11 px-8">
                  <RefreshCw className="mr-2 h-4 w-4" /> Coba Lagi
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <canvas className="hidden" />
      </div>

      {/* Capture button */}
      {st === "idle" && loaded && (
        <div className="flex flex-col items-center gap-2">
          <button disabled={!face} onClick={capture}
            className="h-16 w-16 rounded-full bg-primary shadow-xl shadow-primary/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
            <Camera className="h-7 w-7 text-white" />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {face ? "Ketuk untuk Absen" : "Cari Wajah..."}
          </p>
        </div>
      )}

      {/* Retry */}
      {st === "fail" && (
        <Button onClick={retry} variant="outline" className="w-full max-w-xs h-12 rounded-2xl">
          <RefreshCw className="mr-2 h-4 w-4" /> Pindai Ulang Wajah
        </Button>
      )}
    </div>
  );
}
