import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";

export function DjiwaPayWalletScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(onDetected);
  const [status, setStatus] = useState("Mengaktifkan kamera...");
  detectedRef.current = onDetected;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;
    const start = async () => {
      if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
        setStatus("Browser ini belum mendukung scan QR. Gunakan fitur Terima untuk menyalin nomor HP penerima.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setStatus("Arahkan kamera ke QR Djiwa Pay.");
        const Detector = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try { const result = await detector.detect(videoRef.current); const value = result.find((item) => item.rawValue)?.rawValue; if (value) { detectedRef.current(value); return; } } catch { /* frame can fail while camera starts */ }
          frame = window.requestAnimationFrame(loop);
        };
        frame = window.requestAnimationFrame(loop);
      } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Kamera tidak dapat diakses."); }
    };
    void start();
    return () => { cancelled = true; window.cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, []);
  return <div className="wallet-scanner-backdrop" role="presentation" onClick={onClose}><section className="wallet-scanner-sheet" role="dialog" aria-modal="true" aria-labelledby="wallet-scanner-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><button type="button" className="sheet-close" onClick={onClose} aria-label="Tutup scanner"><X size={18} /></button><h2 id="wallet-scanner-title">Scan QR Djiwa Pay</h2><span className="sheet-spacer" /></div><div className="wallet-scanner-preview"><video ref={videoRef} autoPlay muted playsInline /></div><p className="wallet-scanner-status"><ScanLine size={16} />{status}</p><button type="button" className="secondary-action" onClick={onClose}>Kembali</button></section></div>;
}

export function parseWalletRecipient(rawValue: string) {
  try { const url = new URL(rawValue); if (url.protocol !== "djiwapay:") return null; const phone = url.searchParams.get("phone")?.trim(); return phone || null; } catch { return null; }
}

