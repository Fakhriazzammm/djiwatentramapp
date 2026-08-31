import { Camera, Flashlight, Keyboard, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
	detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type ScannerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDetected: (value: string) => void;
};

function getDetector(): BarcodeDetectorLike | null {
	const Detector = (globalThis as typeof globalThis & {
		BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
	}).BarcodeDetector;
	if (!Detector) return null;
	return new Detector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
}

export function BarcodeTransactionScanner({ open, onOpenChange, onDetected }: ScannerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const frameRef = useRef<number | null>(null);
	const detectedRef = useRef(false);
	const [manualCode, setManualCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [torchOn, setTorchOn] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		detectedRef.current = false;
		setError(null);
		setManualCode("");

		const stop = () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		};

		const start = async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				setError("Kamera tidak tersedia. Masukkan kode barcode secara manual.");
				return;
			}
			if (!getDetector()) {
				setError("Browser belum mendukung scan barcode otomatis. Masukkan kode secara manual.");
				return;
			}
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: "environment" } },
					audio: false,
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}
				streamRef.current = stream;
				if (!videoRef.current) return;
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
				const detector = getDetector();
				const scan = async () => {
					if (cancelled || detectedRef.current || !videoRef.current || !detector) return;
					try {
						const results = await detector.detect(videoRef.current);
						const value = results.find((item) => item.rawValue?.trim())?.rawValue?.trim();
						if (value) {
							detectedRef.current = true;
							onDetected(value);
							onOpenChange(false);
							return;
						}
					} catch {
						// Keep the camera active; manual input remains available.
					}
					frameRef.current = requestAnimationFrame(() => void scan());
				};
				void scan();
			} catch (scanError) {
				setError(scanError instanceof DOMException && scanError.name === "NotAllowedError" ? "Akses kamera ditolak. Izinkan kamera atau masukkan kode manual." : "Kamera tidak dapat dibuka. Masukkan kode barcode secara manual.");
			}
		};
		void start();
		return () => {
			cancelled = true;
			stop();
		};
	}, [onDetected, onOpenChange, open]);

	const toggleTorch = async () => {
		const track = streamRef.current?.getVideoTracks()[0];
		const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean } | undefined;
		if (!track || !capabilities?.torch) {
			setError("Flash tidak tersedia di perangkat ini.");
			return;
		}
		const next = !torchOn;
		await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
		setTorchOn(next);
	};

	const submitManualCode = () => {
		const value = manualCode.trim();
		if (!value) return;
		onDetected(value);
		onOpenChange(false);
	};

	return (
		<div className={open ? "fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" : "hidden"} role="dialog" aria-modal="true" aria-label="Scan barcode transaksi">
			<div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Transaksi</p><h2 className="text-base font-black">Scan Barcode Produk</h2></div>
					<div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Transaksi</p><h2 className="text-base font-black">Scan Barcode Transaksi</h2></div><div className="flex items-center gap-1"><button type="button" onClick={() => void toggleTorch()} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground" aria-label="Nyalakan flash"><Flashlight className={torchOn ? "h-4 w-4 text-amber-500" : "h-4 w-4"} /></button><button type="button" onClick={() => onOpenChange(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border" aria-label="Tutup scanner"><X className="h-4 w-4" /></button></div>
				</div>
				<div className="relative aspect-[4/3] bg-zinc-950">
					<video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Preview kamera barcode" />
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="relative h-32 w-[78%] rounded-2xl border-2 border-primary shadow-[0_0_0_999px_rgba(0,0,0,.38)]"><ScanLine className="absolute -right-2 -top-2 h-5 w-5 text-primary" /><ScanLine className="absolute -bottom-2 -left-2 h-5 w-5 rotate-180 text-primary" /></div></div>
					<div className="absolute bottom-3 left-0 right-0 text-center text-[11px] font-bold text-white">Arahkan barcode ke dalam bingkai</div>
				</div>
				<div className="space-y-3 p-4">
					{error ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">{error}</p> : <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Camera className="h-4 w-4" />Scan barcode order DjiwaApp untuk membuka detail transaksi.</p>}
					<div className="flex gap-2"><div className="relative flex-1"><Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={manualCode} onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitManualCode(); }} placeholder="ORD-APP-D-0037-310826" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" autoCapitalize="characters" /></div><button type="button" onClick={submitManualCode} disabled={!manualCode.trim()} className="h-11 rounded-xl bg-primary px-4 text-[11px] font-black text-primary-foreground disabled:opacity-50">Cari</button></div>
				</div>
			</div>
		</div>
	);
}
