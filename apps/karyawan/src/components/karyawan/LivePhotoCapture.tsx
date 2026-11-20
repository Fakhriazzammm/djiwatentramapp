import { useCallback, useEffect, useRef, useState } from "react";
import { DsButton } from "@djiwaapps/web-shared/components/ds";
import { describeCameraError, type CameraProblem } from "@/components/karyawan/FaceScanner";
import { captureVideoJpeg } from "@/lib/photo-stamp";
import { reportEvent } from "@/lib/attendance-api";

/**
 * Foto selfie langsung dari kamera perangkat. Sengaja TANPA input file / galeri: foto hanya bisa diambil
 * dari kamera yang sedang menyala, diberi cap waktu, lalu dikirim sebagai JPEG.
 */
export function LivePhotoCapture({ stamp, onPhoto, onUnavailable }: { stamp?: string; onPhoto: (dataUrl: string | null) => void; onUnavailable?: (p: CameraProblem) => void }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [shot, setShot] = useState<string | null>(null);
	const [problem, setProblem] = useState<CameraProblem | null>(null);
	const [ready, setReady] = useState(false);
	const [attempt, setAttempt] = useState(0);

	const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

	useEffect(() => {
		if (shot) return;
		let cancelled = false;
		setReady(false); setProblem(null);
		(async () => {
			try {
				if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "Unsupported" });
				let stream: MediaStream;
				try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
				catch (e) {
					const n = (e as { name?: string }).name;
					if (n === "OverconstrainedError" || n === "NotReadableError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
					else throw e;
				}
				if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
				streamRef.current = stream;
				const v = videoRef.current;
				if (v) { v.srcObject = stream; try { await v.play(); } catch { /* otomatis */ } }
				setReady(true);
			} catch (e) {
				if (cancelled) return;
				const p = describeCameraError(e);
				reportEvent("camera", p.code, `foto: ${(e as { name?: string })?.name ?? ""}`);
				setProblem(p); onUnavailable?.(p);
			}
		})();
		return () => { cancelled = true; };
	}, [attempt, shot]);
	useEffect(() => () => stop(), [stop]);

	const take = () => {
		const v = videoRef.current;
		if (!v) return;
		const url = captureVideoJpeg(v, stamp, true);
		if (!url) return;
		stop(); setShot(url); onPhoto(url);
	};
	const retake = () => { setShot(null); onPhoto(null); };

	return (
		<div>
			<div className="kx-cam" style={{ position: "relative" }}>
				{shot ? (
					<img src={shot} alt="Foto selfie absen" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
				) : problem ? (
					<div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 18, textAlign: "center", color: "#fff", background: "#1d2336" }}>
						<div><b style={{ display: "block", font: "700 16px var(--ds-font)", marginBottom: 6 }}>Kamera belum bisa dipakai</b><span style={{ font: "400 13px/1.5 var(--ds-font)", opacity: 0.9 }}>{problem.message}</span></div>
					</div>
				) : (
					<>
						<video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", background: "#1d2336" }} />
						<div role="status" style={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", color: "#fff", font: "600 13px var(--ds-font)", textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>{ready ? "Hadap kamera, pastikan wajah terlihat jelas" : "Membuka kamera…"}</div>
					</>
				)}
			</div>
			<div style={{ marginTop: 10, display: "grid", gap: 8 }}>
				{problem ? <DsButton block onClick={() => setAttempt((n) => n + 1)}>Coba lagi</DsButton>
					: shot ? <DsButton block variant="ghost" onClick={retake}>Ambil ulang</DsButton>
					: <DsButton block disabled={!ready} onClick={take}>Ambil foto</DsButton>}
			</div>
			<p className="ds-sub" style={{ margin: "8px 4px 0", textAlign: "center" }}>Foto harus diambil langsung dari kamera. Unggah dari galeri tidak bisa.</p>
		</div>
	);
}
