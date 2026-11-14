import { AnimatePresence, motion } from "framer-motion";
import { Flashlight, Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IOS_SPRING_SOFT } from "./ios-kit";

type ScanScreenProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDetected: (value: string) => void;
	transactionSuggestions?: Array<{ value: string; label: string; detail?: string }>;
};

const CORNERS = [
	"left-0 top-0 rounded-tl-[14px] border-l-4 border-t-4",
	"right-0 top-0 rounded-tr-[14px] border-r-4 border-t-4",
	"bottom-0 left-0 rounded-bl-[14px] border-b-4 border-l-4",
	"bottom-0 right-0 rounded-br-[14px] border-b-4 border-r-4",
];

/** Scan transaksi: kamera layar penuh, bingkai + laser, panel kaca untuk ketik manual. */
export function ScanScreen({ open, onOpenChange, onDetected, transactionSuggestions = [] }: ScanScreenProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const controlsRef = useRef<{ stop: () => void } | null>(null);
	const detectedRef = useRef(false);
	const [manualCode, setManualCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [torchOn, setTorchOn] = useState(false);

	useEffect(() => {
		if (!open) return;
		detectedRef.current = false;
		setError(null);
		setManualCode("");
		setTorchOn(false);
		const video = videoRef.current;
		const stop = () => {
			controlsRef.current?.stop();
			controlsRef.current = null;
			if (video?.srcObject) (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
			if (video) video.srcObject = null;
		};
		let cancelled = false;
		void (async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				setError("Kamera tidak tersedia. Ketik kode secara manual.");
				return;
			}
			try {
				const { BrowserMultiFormatReader } = await import("@zxing/browser");
				if (cancelled || !video) return;
				const reader = new BrowserMultiFormatReader();
				const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, (result) => {
					const value = result?.getText()?.trim();
					if (!value || detectedRef.current) return;
					detectedRef.current = true;
					onDetected(value);
					onOpenChange(false);
				});
				if (cancelled) controls.stop();
				else controlsRef.current = controls;
			} catch (scanError) {
				setError(scanError instanceof DOMException && scanError.name === "NotAllowedError" ? "Akses kamera ditolak. Izinkan kamera atau ketik kode manual." : "Kamera tidak dapat dibuka. Ketik kode secara manual.");
			}
		})();
		return () => {
			cancelled = true;
			stop();
		};
	}, [onDetected, onOpenChange, open]);

	const toggleTorch = async () => {
		const track = videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject.getVideoTracks()[0] : undefined;
		const caps = track?.getCapabilities() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
		if (!track || !caps?.torch) {
			setError("Flash tidak tersedia di perangkat ini.");
			return;
		}
		const next = !torchOn;
		await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
		setTorchOn(next);
	};

	const submit = (value = manualCode) => {
		const v = value.trim();
		if (!v) return;
		onDetected(v);
		onOpenChange(false);
	};

	const q = manualCode.trim().toLowerCase();
	const suggestions = q ? transactionSuggestions.filter((s) => `${s.value} ${s.label} ${s.detail ?? ""}`.toLowerCase().includes(q)).slice(0, 5) : [];

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					className="fixed inset-0 z-[80] overflow-hidden bg-black"
					role="dialog"
					aria-modal="true"
					aria-label="Scan barcode transaksi"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.22 }}
				>
					<video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-label="Preview kamera barcode" />
					<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
					<div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
						<button type="button" onClick={() => onOpenChange(false)} aria-label="Tutup scanner" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md active:scale-90">
							<X className="h-5 w-5" />
						</button>
						<span className="rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-md">Scan Transaksi</span>
						<button type="button" onClick={() => void toggleTorch()} aria-label="Nyalakan flash" className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md active:scale-90 ${torchOn ? "bg-amber-400 text-black" : "bg-white/20 text-white"}`}>
							<Flashlight className="h-5 w-5" />
						</button>
					</div>
					<div className="pointer-events-none absolute inset-x-8 top-[22%] h-[34%] max-h-[280px]">
						{CORNERS.map((c) => <span key={c} className={`absolute h-8 w-8 border-white ${c}`} />)}
						<motion.span className="absolute inset-x-3 h-0.5 rounded-full bg-sky-300 shadow-[0_0_14px_#7dd3fc]" initial={{ top: "6%" }} animate={{ top: "92%" }} transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }} />
					</div>
					<p className="pointer-events-none absolute inset-x-0 top-[58%] text-center text-sm font-semibold text-white drop-shadow">Arahkan ke barcode transaksi</p>
					<motion.div
						className="absolute inset-x-0 bottom-0 rounded-t-[26px] bg-background/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_40px_rgba(0,0,0,.3)] backdrop-blur-xl"
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={IOS_SPRING_SOFT}
					>
						<div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-foreground/20" />
						{error ? <p className="mb-2 rounded-xl bg-amber-100 px-3 py-2 text-[11px] font-semibold text-amber-800">{error}</p> : null}
						{suggestions.length > 0 ? (
							<div className="mb-2 max-h-48 overflow-y-auto rounded-2xl bg-card p-1 shadow-sm" role="listbox" aria-label="Transaksi ditemukan">
								{suggestions.map((s) => (
									<button key={s.value} type="button" role="option" onClick={() => submit(s.value)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left active:bg-primary/10">
										<span className="min-w-0"><span className="block truncate text-xs font-black text-primary">{s.value}</span><span className="block truncate text-[11px] font-semibold">{s.label}</span></span>
										{s.detail ? <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{s.detail}</span> : null}
									</button>
								))}
							</div>
						) : null}
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<input value={manualCode} onChange={(e) => setManualCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Urutan, tanggal, nama customer" className="h-11 w-full rounded-2xl border border-border bg-card pl-9 pr-3 text-sm outline-none" autoCapitalize="characters" />
							</div>
							<button type="button" onClick={() => submit()} disabled={!manualCode.trim()} className="h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-40">Cari</button>
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
