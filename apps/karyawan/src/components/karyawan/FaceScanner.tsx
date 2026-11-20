import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { DsButton } from "@djiwaapps/web-shared/components/ds";
import { preloadFaceModels } from "@/components/auth/FaceRecognition";
import { reportEvent } from "@/lib/attendance-api";

export type CameraProblem = { code: "denied" | "blocked_overlay" | "no_camera" | "busy" | "insecure" | "models" | "unsupported" | "unknown"; message: string };

/** Terjemahkan galat getUserMedia ke pesan yang bisa ditindaklanjuti karyawan. */
export function describeCameraError(e: unknown): CameraProblem {
	const name = (e as { name?: string })?.name ?? "";
	const msg = String((e as { message?: string })?.message ?? "");
	if (name === "NotAllowedError" || name === "PermissionDeniedError") {
		return { code: /overlay|obscur/i.test(msg) ? "blocked_overlay" : "denied", message: "Izin kamera belum diberikan atau terblokir. Jika muncul “Situs ini tidak dapat meminta izin Anda”, tutup gelembung/overlay di layar (chat head, perekam layar, filter cahaya biru, pop-up aplikasi lain), lalu tekan Coba lagi. Atau buka Pengaturan situs di browser → Kamera → Izinkan." };
	}
	if (name === "NotFoundError" || name === "DevicesNotFoundError") return { code: "no_camera", message: "Kamera depan tidak ditemukan di perangkat ini." };
	if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return { code: "busy", message: "Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/video call lalu coba lagi." };
	if (name === "SecurityError") return { code: "insecure", message: "Browser memblokir kamera. Buka aplikasi lewat https://karyawan.djiwatentram.web.id." };
	if (!navigator.mediaDevices?.getUserMedia) return { code: "unsupported", message: "Browser ini tidak mendukung kamera. Pakai Chrome atau Safari versi terbaru." };
	return { code: "unknown", message: "Kamera tidak bisa dibuka. Coba lagi, atau pakai PIN." };
}

const mean = (list: number[][]) => list[0].map((_, i) => list.reduce((s, d) => s + d[i], 0) / list.length);

function snapshot(video: HTMLVideoElement): string | null {
	try {
		const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w) || 640;
		const c = document.createElement("canvas");
		c.width = w; c.height = h;
		const ctx = c.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0, w, h);
		return c.toDataURL("image/jpeg", 0.7);
	} catch { return null; }
}

type Props = {
	mode: "enroll" | "verify";
	/** Dipanggil setelah wajah terbaca stabil. Lempar Error(message) bila server menolak. */
	onDone: (descriptor: number[], photo: string | null) => Promise<void>;
	/** Kamera/model tidak bisa dipakai: induk menawarkan PIN. */
	onUnavailable?: (p: CameraProblem) => void;
};

/**
 * Pemindai wajah: kamera depan, tunggu wajah stabil (beberapa bingkai berturut-turut, ukuran cukup),
 * lalu ambil deskriptor. Pendaftaran = rata-rata 3 bingkai (lebih tahan cahaya/sudut). Verifikasi = rata-rata 2 bingkai.
 */
export function FaceScanner({ mode, onDone, onUnavailable }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const runRef = useRef(0);
	const [phase, setPhase] = useState<"starting" | "searching" | "hold" | "reading" | "sending" | "done" | "error">("starting");
	const [problem, setProblem] = useState<CameraProblem | null>(null);
	const [failMsg, setFailMsg] = useState<string | null>(null);
	const [hint, setHint] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

	useEffect(() => {
		const run = ++runRef.current;
		let cancelled = false;
		const alive = () => !cancelled && runRef.current === run;
		setPhase("starting"); setProblem(null); setFailMsg(null); setHint(null);

		(async () => {
			// 1. Kamera
			let stream: MediaStream;
			try {
				if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "Unsupported" });
				try {
					stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
				} catch (e) {
					// Perangkat tertentu menolak batasan resolusi/facingMode: coba tanpa batasan sebelum menyerah.
					if ((e as { name?: string }).name === "OverconstrainedError" || (e as { name?: string }).name === "NotReadableError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
					else throw e;
				}
			} catch (e) {
				if (!alive()) return;
				const p = describeCameraError(e);
				reportEvent("camera", p.code, `${(e as { name?: string })?.name ?? ""} ${String((e as { message?: string })?.message ?? "").slice(0, 120)}`);
				setProblem(p); setPhase("error"); onUnavailable?.(p);
				return;
			}
			if (!alive()) { stream.getTracks().forEach((t) => t.stop()); return; }
			streamRef.current = stream;
			const video = videoRef.current;
			if (!video) return;
			video.srcObject = stream;
			try { await video.play(); } catch { /* beberapa browser memutar otomatis */ }

			// 2. Model wajah
			setHint("Menyiapkan pemindai wajah…");
			const ok = await preloadFaceModels();
			if (!alive()) return;
			if (!ok) {
				const p: CameraProblem = { code: "models", message: "Pemindai wajah gagal dimuat (koneksi lambat?). Coba lagi atau pakai PIN." };
				reportEvent("camera", "models", "gagal memuat model wajah");
				setProblem(p); setPhase("error"); stop(); onUnavailable?.(p);
				return;
			}

			// 3. Cari wajah stabil
			setPhase("searching"); setHint(null);
			const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
			const need = mode === "enroll" ? 3 : 2;
			const samples: number[][] = [];
			let good = 0;
			const started = Date.now();
			let lastSample = 0;

			while (alive()) {
				if (Date.now() - started > 45_000) { setHint("Belum terbaca. Cari tempat lebih terang, dekatkan wajah, atau pakai PIN."); }
				try {
					const det = await faceapi.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
					if (!alive()) return;
					const vw = video.videoWidth || 1;
					const box = det?.detection.box;
					const sizeOk = !!box && box.width / vw >= 0.22;
					const centered = !!box && Math.abs(box.x + box.width / 2 - vw / 2) / vw < 0.28;
					if (det && det.detection.score >= 0.6 && sizeOk && centered) {
						good++;
						setPhase(good >= 2 ? "reading" : "hold");
						if (good >= 2 && Date.now() - lastSample > 220) { samples.push(Array.from(det.descriptor)); lastSample = Date.now(); }
					} else {
						good = 0; samples.length = 0;
						setPhase("searching");
						setHint(!det ? null : !sizeOk ? "Dekatkan wajah ke kamera" : !centered ? "Posisikan wajah di tengah" : "Hadap lurus ke kamera");
					}
					if (samples.length >= need) break;
				} catch {
					good = 0; samples.length = 0;
				}
				await new Promise((r) => setTimeout(r, 90));
			}
			if (!alive() || samples.length < need) return;

			// 4. Kirim
			setPhase("sending");
			const photo = snapshot(video);
			try {
				await onDone(mean(samples), photo);
				if (!alive()) return;
				setPhase("done"); stop();
			} catch (e) {
				if (!alive()) return;
				setFailMsg(e instanceof Error ? e.message : "Verifikasi gagal");
				reportEvent(mode === "enroll" ? "enroll" : "face", "rejected", e instanceof Error ? e.message : "");
				setPhase("error");
			}
		})();

		return () => { cancelled = true; };
	}, [attempt, mode]);

	useEffect(() => () => stop(), [stop]);

	const label = phase === "starting" ? (hint ?? "Membuka kamera…")
		: phase === "searching" ? (hint ?? "Arahkan wajah ke dalam lingkaran")
		: phase === "hold" ? "Tahan sebentar…"
		: phase === "reading" ? "Memindai…"
		: phase === "sending" ? (mode === "enroll" ? "Menyimpan…" : "Memeriksa…")
		: phase === "done" ? "Berhasil" : "";

	return (
		<div>
			<div className="kx-cam" style={{ position: "relative" }}>
				<video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", background: "#1d2336", display: phase === "error" && problem ? "none" : "block" }} />
				<div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
					<div style={{ width: "62%", aspectRatio: "3/4", borderRadius: "50%", border: `3px solid ${phase === "reading" || phase === "hold" || phase === "sending" || phase === "done" ? "#4be08c" : "rgba(255,255,255,.85)"}`, boxShadow: "0 0 0 999px rgba(15,35,71,.5)", transition: "border-color .2s" }} />
				</div>
				{phase !== "error" && <div role="status" style={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", color: "#fff", font: "600 13px var(--ds-font)", textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>{label}</div>}
				{phase === "error" && problem && (
					<div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 18, textAlign: "center", color: "#fff", background: "#1d2336" }}>
						<div><b style={{ display: "block", font: "700 16px var(--ds-font)", marginBottom: 6 }}>Kamera belum bisa dipakai</b><span style={{ font: "400 13px/1.5 var(--ds-font)", opacity: 0.9 }}>{problem.message}</span></div>
					</div>
				)}
			</div>
			{phase === "error" && (
				<div style={{ marginTop: 10, display: "grid", gap: 8 }}>
					{failMsg && <div className="kx-err" role="alert">{failMsg}</div>}
					<DsButton block onClick={() => setAttempt((n) => n + 1)}>Coba lagi</DsButton>
				</div>
			)}
		</div>
	);
}
