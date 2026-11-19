import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IOS_SPRING } from "./ios-kit";

/**
 * Kamera bukti tunai. Hanya memakai kamera perangkat (getUserMedia), tanpa pilihan galeri/berkas,
 * lalu membubuhkan cap waktu + kasir + nominal pada foto agar tidak bisa dipakai ulang.
 */
export function CashProofCamera({ open, stampText, onClose, onCapture }: { open: boolean; stampText: string; onClose: () => void; onCapture: (dataUrl: string) => void }) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [flash, setFlash] = useState(false);

	const stop = useCallback(() => {
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		setReady(false);
	}, []);

	const start = useCallback(async () => {
		setError(null);
		setReady(false);
		if (!navigator.mediaDevices?.getUserMedia) {
			setError("Kamera tidak tersedia di perangkat/browser ini. Buka POS lewat HTTPS dan izinkan kamera.");
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
			streamRef.current = stream;
			const video = videoRef.current;
			if (video) {
				video.srcObject = stream;
				await video.play().catch(() => undefined);
			}
			setReady(true);
		} catch (cause) {
			const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
			setError(denied ? "Izin kamera ditolak. Aktifkan izin kamera untuk POS di pengaturan browser, lalu coba lagi." : "Kamera tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.");
		}
	}, []);

	useEffect(() => {
		if (!open) { stop(); return; }
		void start();
		return stop;
	}, [open, start, stop]);

	const shoot = () => {
		const video = videoRef.current;
		if (!video || !ready || !video.videoWidth) return;
		const scale = Math.min(1, 1280 / video.videoWidth);
		const width = Math.round(video.videoWidth * scale);
		const height = Math.round(video.videoHeight * scale);
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.drawImage(video, 0, 0, width, height);
		const barHeight = Math.max(34, Math.round(height * 0.06));
		ctx.fillStyle = "rgba(0,0,0,0.62)";
		ctx.fillRect(0, height - barHeight, width, barHeight);
		ctx.fillStyle = "#fff";
		ctx.font = `600 ${Math.round(barHeight * 0.45)}px -apple-system, system-ui, sans-serif`;
		ctx.textBaseline = "middle";
		ctx.fillText(stampText, Math.round(barHeight * 0.4), height - barHeight / 2, width - barHeight * 0.8);
		setFlash(true);
		window.setTimeout(() => setFlash(false), 220);
		if (navigator.vibrate) navigator.vibrate(12);
		onCapture(canvas.toDataURL("image/jpeg", 0.82));
	};

	return createPortal(
		<AnimatePresence>
			{open ? (
				<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[200] flex flex-col bg-black text-white" role="dialog" aria-label="Foto bukti tunai">
					<div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
						<p className="text-[15px] font-bold">Foto uang tunai</p>
						<button type="button" onClick={onClose} aria-label="Tutup kamera" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><X className="h-5 w-5" /></button>
					</div>
					<div className="relative min-h-0 flex-1 overflow-hidden">
						<video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
						{!ready && !error ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : null}
						{error ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
								<Camera className="h-10 w-10 opacity-70" />
								<p className="text-[14px] leading-relaxed">{error}</p>
								<button type="button" onClick={() => void start()} className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-bold text-black"><RotateCcw className="h-4 w-4" />Coba lagi</button>
							</div>
						) : null}
						<div className="pointer-events-none absolute inset-6 rounded-3xl border-2 border-white/40" />
						<p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] font-semibold text-white/80">Susun semua uang dalam satu frame, pastikan jelas</p>
						<AnimatePresence>{flash ? <motion.div initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="pointer-events-none absolute inset-0 bg-white" /> : null}</AnimatePresence>
					</div>
					<div className="flex items-center justify-center pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
						<motion.button type="button" whileTap={{ scale: 0.88 }} transition={IOS_SPRING} disabled={!ready} onClick={shoot} aria-label="Ambil foto" className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40">
							<span className="h-[58px] w-[58px] rounded-full bg-white" />
						</motion.button>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>,
		document.body,
	);
}
