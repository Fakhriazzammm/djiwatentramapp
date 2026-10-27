import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";

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

  return <div className="wallet-scanner">
    <div className="wallet-scanner-preview">
      <video ref={videoRef} autoPlay muted playsInline />
      <span className="wallet-scanner-frame" aria-hidden="true" />
    </div>
    <p className={`wallet-scanner-status${error ? " is-error" : ""}`} role="status"><ScanLine size={16} />{status}</p>
    {notice ? <p className="wallet-action-message" role="alert">{notice}</p> : null}
    <button type="button" className="wallet-scanner-manual" onClick={onUseManual}><Camera size={16} />Gunakan nomor HP</button>
  </div>;
}
