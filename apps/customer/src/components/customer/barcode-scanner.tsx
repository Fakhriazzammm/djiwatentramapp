import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

export function BarcodeScanner({
	onClose,
	onDetected,
}: {
	onClose: () => void;
	onDetected: (rawValue: string) => void;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [status, setStatus] = useState("Mengaktifkan kamera...");
	const onDetectedRef = useRef(onDetected);
	onDetectedRef.current = onDetected;

	useEffect(() => {
		let stream: MediaStream | null = null;
		let frame = 0;
		let cancelled = false;

		const start = async () => {
			if (
				typeof window === "undefined" ||
				!("BarcodeDetector" in window) ||
				!navigator.mediaDevices?.getUserMedia
			) {
				setStatus(
					"Browser ini belum mendukung scan barcode. Gunakan input nomor produk."
				);
				return;
			}
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: "environment" } },
					audio: false,
				});
				if (cancelled) return;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}
				setStatus("Arahkan kamera ke barcode menu.");
				const Detector = (window as any).BarcodeDetector;
				const detector = new Detector({
					formats: [
						"code_128",
						"ean_13",
						"ean_8",
						"upc_a",
						"upc_e",
						"qr_code",
					],
				});
				const detectLoop = async () => {
					if (cancelled || !videoRef.current) return;
					try {
						const result = await detector.detect(videoRef.current);
						const rawValue = result.find(
							(item: any) => item.rawValue
						)?.rawValue;
						if (rawValue) {
							onDetectedRef.current(rawValue);
							return;
						}
					} catch {
						// ignore frame failures
					}
					frame = window.requestAnimationFrame(detectLoop);
				};
				frame = window.requestAnimationFrame(detectLoop);
			} catch (error) {
				setStatus(
					(error as Error).message || "Kamera tidak dapat diakses."
				);
			}
		};

		start();
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			stream?.getTracks().forEach((track) => track.stop());
		};
	}, []);

	return (
		<div className="space-y-3 px-4 py-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">
						Barcode scanner
					</p>
					<h3 className="mt-0.5 text-lg font-black">Scan nomor produk</h3>
				</div>
				<button
					type="button"
					className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
					onClick={onClose}
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>
			<div className="overflow-hidden rounded-xl bg-black">
				<video
					ref={videoRef}
					autoPlay
					className="aspect-[4/5] w-full object-cover"
					muted
					playsInline
				/>
			</div>
			<p className="rounded-xl bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground">
				{status}
			</p>
			<button
				type="button"
				className="w-full rounded-xl border border-border bg-card px-3 py-3 text-xs font-black"
				onClick={onClose}
			>
				Kembali ke input nomor
			</button>
		</div>
	);
}
