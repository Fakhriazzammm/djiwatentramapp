import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ic } from "./dpx-ui";

/**
 * Full-screen in-app scanner: live viewfinder, corner brackets, a "detected" pill, flash and gallery.
 * Falls back to the phone's own camera app when the browser cannot open a live stream.
 */
export function ScanCamera({ kind, onCapture, onClose }: { kind: "receipt" | "asset"; onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const gallery = useRef<HTMLInputElement>(null), native = useRef<HTMLInputElement>(null);
  const [on, setOn] = useState(false), [failed, setFailed] = useState(false), [found, setFound] = useState(false);
  const [torch, setTorch] = useState(false), [canTorch, setCanTorch] = useState(false), [flash, setFlash] = useState(false);
  const receipt = kind === "receipt";

  useEffect(() => {
    let dead = false;
    if (!navigator.mediaDevices?.getUserMedia) { setFailed(true); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setCanTorch(Boolean(caps.torch));
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        setOn(true);
      })
      .catch(() => setFailed(true));
    return () => { dead = true; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Cheap paper check: a bright, even patch in the middle that clearly outshines the frame edges.
  useEffect(() => {
    if (!on) return;
    const c = document.createElement("canvas"); c.width = 32; c.height = 48;
    const g = c.getContext("2d", { willReadFrequently: true }); if (!g) return;
    const id = window.setInterval(() => {
      const v = video.current; if (!v || !v.videoWidth) return;
      g.drawImage(v, 0, 0, 32, 48);
      const d = g.getImageData(0, 0, 32, 48).data;
      let mid = 0, midN = 0, edge = 0, edgeN = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (x > 7 && x < 25 && y > 8 && y < 40) { mid += l; midN++; } else { edge += l; edgeN++; }
      }
      mid /= midN; edge /= edgeN;
      setFound(mid > (receipt ? 110 : 70) && Math.abs(mid - edge) > 22);
    }, 450);
    return () => window.clearInterval(id);
  }, [on, receipt]);

  const toggleTorch = () => {
    const t = stream.current?.getVideoTracks()[0]; if (!t) return;
    const next = !torch;
    t.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).then(() => setTorch(next)).catch(() => setCanTorch(false));
  };
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) { native.current?.click(); return; }
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true);
    c.toBlob((b) => { if (b) onCapture(new File([b], `${kind}-${Date.now()}.jpg`, { type: "image/jpeg" })); }, "image/jpeg", 0.92);
  };
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onCapture(f); };

  const title = receipt ? "Pindai struk" : "Foto aset";
  const pill = !on ? (failed ? "Kamera tidak bisa dibuka" : "Membuka kamera…") : receipt ? (found ? "Struk terdeteksi" : "Arahkan ke struk") : found ? "Aset terdeteksi" : "Taruh aset di dalam bingkai";
  const node = <div className={`dpx dpx-scan ${flash ? "shot" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
    <video ref={video} playsInline muted aria-label="Pratinjau kamera" className={on ? "on" : ""} />
    <div className="dpx-scan-top">
      <button type="button" className="dpx-scan-btn" onClick={onClose} aria-label="Tutup"><Ic n="close" /></button>
      <b>{title}</b>
      <span className={`dpx-scan-btn ghost ${torch ? "lit" : ""}`}><Ic n="flash" size="sm" /></span>
    </div>
    <div className={`dpx-scan-pill ${found && on ? "ok" : ""}`} role="status" aria-live="polite"><i />{pill}</div>
    <div className={`dpx-scan-frame ${receipt ? "tall" : "sq"} ${found && on ? "ok" : ""}`} aria-hidden="true"><i className="a" /><i className="b" /><i className="c" /><i className="d" /></div>
    {failed ? <div className="dpx-scan-fail"><p>Kamera dalam aplikasi belum bisa dibuka. Pakai kamera ponsel atau pilih dari galeri.</p><button type="button" className="dpx-btn" onClick={() => native.current?.click()}><Ic n="scan" size="sm" /> Buka kamera ponsel</button></div> : null}
    <p className="dpx-scan-tip">{receipt ? "Ratakan struk, pastikan semua baris terlihat dan terang." : "Satu aset per foto, di tempat polos dan terang."}</p>
    <div className="dpx-scan-bar">
      <button type="button" className="dpx-scan-side" onClick={() => gallery.current?.click()} aria-label="Pilih dari galeri" />
      <button type="button" className="dpx-scan-shutter" onClick={snap} aria-label="Ambil foto" disabled={!on && !failed}><i /></button>
      {canTorch ? <button type="button" className="dpx-scan-auto" onClick={toggleTorch} aria-pressed={torch}>{torch ? "Nyala" : "Auto"}</button> : <span className="dpx-scan-auto ghost">Auto</span>}
    </div>
    {flash ? <div className="dpx-scan-flash" /> : null}
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
    <input ref={native} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
  </div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

const SWEEP_STEPS: Record<"receipt" | "asset", string[]> = {
  receipt: ["Mengunggah foto dengan aman", "Membaca seluruh item dan harga", "Memeriksa subtotal, pajak, dan total"],
  asset: ["Mengunggah foto dengan aman", "Memisahkan aset dari latar", "Membuat stiker"],
};

/** Dark full-screen "reading" stage: the photo sits alone while an iridescent light band sweeps over it. */
export function ScanSweep({ src, kind, onClose }: { src: string; kind: "receipt" | "asset"; onClose?: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => { const a = setTimeout(() => setStep(1), 1000), b = setTimeout(() => setStep(2), 2800); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  const node = <div className="dpx dpx-scan dpx-sweep" role="dialog" aria-modal="true" aria-label="Memproses foto">
    <div className="dpx-scan-top">{onClose ? <button type="button" className="dpx-scan-btn" onClick={onClose} aria-label="Batalkan"><Ic n="close" /></button> : <span className="dpx-scan-btn ghost" />}<b /><span className="dpx-scan-btn ghost" /></div>
    <div className={`dpx-sweep-stage ${kind}`}>
      <img className="base" src={src} alt="Foto yang sedang diproses" />
      <img className="lit" src={src} alt="" aria-hidden="true" />
      <i className="band" aria-hidden="true" />
    </div>
    <div className="dpx-sweep-status" role="status" aria-live="polite">{SWEEP_STEPS[kind][step]}…</div>
  </div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
