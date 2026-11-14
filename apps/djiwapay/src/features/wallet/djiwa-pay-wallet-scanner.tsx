import { useEffect, useRef, useState } from "react";
import { Ic } from "../shell/dpx-ui";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type Props = {
  onDetected: (value: string) => boolean;
  onUseManual: () => void;
  notice?: string | null;
};

export function DjiwaPayWalletScanner({ onDetected, onUseManual, notice = null }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(onDetected);
  const lastDetection = useRef<{ value: string; at: number } | null>(null);
  const [status, setStatus] = useState("Mengaktifkan kamera...");
  const [error, setError] = useState(false);
  detectedRef.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;

    const emit = (value: string) => {
      if (!value.trim() || cancelled) return;
      const now = Date.now();
      const last = lastDetection.current;
      if (last && last.value === value && now - last.at < 2500) return;
      lastDetection.current = { value, at: now };
      if (detectedRef.current(value)) cancelled = true;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(true);
        setStatus("Kamera tidak tersedia di browser ini. Gunakan nomor HP penerima.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("Arahkan kamera ke QR Djiwa Pay.");

        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
        let jsQr: typeof import("jsqr").default | null = null;
        if (!detector) {
          try {
            jsQr = (await import("jsqr")).default;
          } catch {
            setError(true);
            setStatus("Browser ini belum dapat membaca QR. Gunakan nomor HP penerima.");
            return;
          }
        }
        canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!detector && !context) {
          setError(true);
          setStatus("Browser ini belum dapat membaca QR. Gunakan nomor HP penerima.");
          return;
        }

        const tick = async () => {
          if (cancelled) return;
          const element = videoRef.current;
          if (element && element.readyState >= 2) {
            try {
              let value: string | undefined;
              if (detector) {
                const results = await detector.detect(element);
                value = results.find((result) => result.rawValue)?.rawValue;
              } else if (jsQr && context && canvas) {
                const width = element.videoWidth;
                const height = element.videoHeight;
                if (width && height) {
                  const ratio = Math.min(1, 640 / Math.max(width, height));
                  const targetWidth = Math.round(width * ratio);
                  const targetHeight = Math.round(height * ratio);
                  if (canvas.width !== targetWidth) canvas.width = targetWidth;
                  if (canvas.height !== targetHeight) canvas.height = targetHeight;
                  context.drawImage(element, 0, 0, targetWidth, targetHeight);
                  const frame = context.getImageData(0, 0, targetWidth, targetHeight);
                  value = jsQr(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data;
                }
              }
              if (value) emit(value);
            } catch {
              /* a frame can fail while the camera is warming up */
            }
          }
          if (!cancelled) timer = window.setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch (cause) {
        if (cancelled) return;
        setError(true);
        setStatus(cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
          ? "Izin kamera ditolak. Aktifkan izin kamera atau gunakan nomor HP penerima."
          : "Kamera tidak dapat diakses. Gunakan nomor HP penerima.");
      }
    };

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return <div className="dpx"><div className="dpx-cam" style={{ background: "#0b1020" }}>
    <video ref={videoRef} autoPlay muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: error ? 0 : 0.92 }} />
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 42%,transparent 30%,rgba(8,12,24,.72) 78%)" }} aria-hidden="true" />
    <div className="dpx-hdr" style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 14px)", left: 18, right: 18 }}>
      <button type="button" className="dpx-rb" onClick={onUseManual} aria-label="Tutup pemindai"><Ic n="close" /></button>
      <div className="dpx-grow"><h1 style={{ color: "#fff" }}>Scan QR</h1></div><span style={{ width: 44 }} />
    </div>
    <div className="dpx-frame" aria-hidden="true"><i /><i /><i /><i />{error ? null : <div className="dpx-scanline" />}</div>
    <div style={{ position: "absolute", left: 24, right: 24, top: "62%" }}>
      <p className="dpx-center" role="status" style={{ color: error ? "#ffd2cc" : "rgba(255,255,255,.88)", fontSize: 15, margin: 0 }}>{status}</p>
      {notice ? <p className="dpx-note dpx-danger" role="alert" style={{ marginTop: 12 }}><Ic n="warn" /><span>{notice}</span></p> : null}
    </div>
    <div style={{ position: "absolute", left: 18, right: 18, bottom: "calc(env(safe-area-inset-bottom,0px) + 34px)" }}>
      <button type="button" className="dpx-btn" style={{ background: "#fff", color: "var(--navy)", margin: 0 }} onClick={onUseManual}><Ic n="phone" size="sm" /> Gunakan nomor HP</button>
    </div>
  </div></div>;
}
