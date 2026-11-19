import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { parseRecipientQr } from "@/lib/pay-bridge";
import { PaySheet } from "./pay-ui";

type Detector = { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> };

/** Camera QR reader for Djiwa Pay receive codes. Uses BarcodeDetector when present, jsQR otherwise. */
export function ScanFlow({ open, onClose, onPhone, onManual }: { open: boolean; onClose: () => void; onPhone: (phone: string) => void; onManual: () => void }) {
	const video = useRef<HTMLVideoElement | null>(null);
	const [status, setStatus] = useState("Mengaktifkan kamera…");
	const [problem, setProblem] = useState(false);

	useEffect(() => {
		if (!open) return;
		let stream: MediaStream | null = null; let timer = 0; let stop = false;
		setStatus("Mengaktifkan kamera…"); setProblem(false);
		const fail = (m: string) => { setProblem(true); setStatus(m); };
		void (async () => {
			if (!navigator.mediaDevices?.getUserMedia) return fail("Kamera tidak tersedia. Pakai nomor HP penerima.");
			try {
				stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
				if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
				const el = video.current; if (!el) return;
				el.srcObject = stream; await el.play();
				setStatus("Arahkan kamera ke QR Djiwa Pay.");
				const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
				const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
				const jsQr = detector ? null : (await import("jsqr")).default;
				const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d", { willReadFrequently: true });
				const handle = (raw?: string) => {
					if (!raw || stop) return;
					const phone = parseRecipientQr(raw);
					if (phone) { stop = true; onPhone(phone); } else setStatus("QR ini bukan QR penerima Djiwa Pay.");
				};
				const tick = async () => {
					if (stop) return;
					if (el.readyState >= 2) {
						try {
							if (detector) handle((await detector.detect(el)).find((r) => r.rawValue)?.rawValue);
							else if (jsQr && ctx && el.videoWidth) {
								const ratio = Math.min(1, 640 / Math.max(el.videoWidth, el.videoHeight));
								canvas.width = Math.round(el.videoWidth * ratio); canvas.height = Math.round(el.videoHeight * ratio);
								ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
								handle(jsQr(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data);
							}
						} catch { /* frame gagal dibaca, coba lagi */ }
					}
					timer = window.setTimeout(tick, 220);
				};
				void tick();
			} catch { fail("Izin kamera ditolak. Pakai nomor HP penerima."); }
		})();
		return () => { stop = true; window.clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	return (
		<PaySheet open={open} title="Scan QR" onClose={onClose}>
			<div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[#0f2347]">
				<video ref={video} playsInline muted className="h-full w-full object-cover" />
				{!problem && <>
					<div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/80" />
					<motion.div className="pointer-events-none absolute inset-x-8 h-0.5 rounded-full bg-[#7fb0ff] shadow-[0_0_12px_#7fb0ff]" initial={{ top: "20%" }} animate={{ top: ["20%", "78%", "20%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
				</>}
			</div>
			<p className={`mt-3 text-center text-sm ${problem ? "text-[#d23a2a]" : "text-[#6b7080]"}`} role="status">{status}</p>
			<button type="button" onClick={onManual} className="mt-3 w-full rounded-full bg-[#f1f3f8] py-3 text-sm font-semibold text-[#0f2347]">Masukkan nomor HP</button>
		</PaySheet>
	);
}
