import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Foto asli harus baru diambil: berkas lebih tua dari ini dianggap dari galeri dan ditolak. */
const MAX_FILE_AGE_MS = 3 * 60 * 1000;

/**
 * Bukti tunai memakai kamera bawaan perangkat (aplikasi kamera HP lewat capture="environment"), bukan kamera di dalam aplikasi.
 * Foto lalu dibubuhi cap waktu + kasir + nominal. Berkas lama (dari galeri) ditolak.
 */
export function CashProofCamera({ open, stampText, onClose, onCapture }: { open: boolean; stampText: string; onClose: () => void; onCapture: (dataUrl: string) => void }) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const stampRef = useRef(stampText);
	stampRef.current = stampText;

	useEffect(() => {
		if (!open) return;
		const input = inputRef.current;
		if (!input) return;
		input.value = "";
		input.click();
	}, [open]);

	const handleFile = async (file: File | undefined) => {
		if (!file) { onClose(); return; }
		if (!file.type.startsWith("image/")) { toast.error("Berkas harus berupa foto dari kamera."); onClose(); return; }
		if (file.lastModified && Date.now() - file.lastModified > MAX_FILE_AGE_MS) {
			toast.error("Foto ditolak: bukan foto baru. Ambil foto langsung memakai kamera, bukan dari galeri.");
			onClose();
			return;
		}
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
			const scale = Math.min(1, 1280 / bitmap.width);
			const width = Math.round(bitmap.width * scale);
			const height = Math.round(bitmap.height * scale);
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("canvas");
			ctx.drawImage(bitmap, 0, 0, width, height);
			bitmap.close?.();
			const barHeight = Math.max(34, Math.round(height * 0.06));
			ctx.fillStyle = "rgba(0,0,0,0.62)";
			ctx.fillRect(0, height - barHeight, width, barHeight);
			ctx.fillStyle = "#fff";
			ctx.font = `600 ${Math.round(barHeight * 0.45)}px -apple-system, system-ui, sans-serif`;
			ctx.textBaseline = "middle";
			ctx.fillText(stampRef.current, Math.round(barHeight * 0.4), height - barHeight / 2, width - barHeight * 0.8);
			navigator.vibrate?.(12);
			onCapture(canvas.toDataURL("image/jpeg", 0.82));
		} catch {
			toast.error("Foto tidak bisa diproses. Coba ambil ulang.");
			onClose();
		}
	};

	return (
		<input
			ref={inputRef}
			type="file"
			accept="image/*"
			capture="environment"
			hidden
			aria-label="Foto bukti tunai"
			onChange={(event) => void handleFile(event.target.files?.[0])}
			onCancel={onClose}
		/>
	);
}
