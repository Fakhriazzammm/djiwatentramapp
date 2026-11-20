import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DsButton } from "@djiwaapps/web-shared/components/ds";
import { LivePhotoCapture } from "@/components/karyawan/LivePhotoCapture";

const FaceScanner = lazy(() => import("@/components/karyawan/FaceScanner").then((m) => ({ default: m.FaceScanner })));

/** Semua metode menyertakan foto selfie yang diambil langsung dari kamera (tidak bisa diunggah). */
export type VerifyPayload =
	| { method: "face"; faceDescriptor: number[]; photo: string | null }
	| { method: "pin"; pin: string; photo: string }
	| { method: "photo"; photo: string };

type Method = "face" | "pin" | "photo";

/**
 * Verifikasi absen. Tiga cara:
 *  • Wajah: pindai wajah otomatis (foto ikut terambil), dicocokkan di server.
 *  • PIN + foto: foto selfie langsung dari kamera, lalu PIN 6 digit.
 *  • Foto langsung: hanya foto selfie dari kamera (dilihat atasan di laporan grup, tanpa pencocokan otomatis).
 */
export function VerifyIdentity({ hasFace, submit, locked, stamp, allowPhotoOnly = true, footer }: {
	hasFace: boolean;
	submit: (p: VerifyPayload) => Promise<void>;
	locked?: boolean;
	/** Nama karyawan untuk cap pada foto. */
	stamp?: string;
	allowPhotoOnly?: boolean;
	footer?: ReactNode;
}) {
	const [method, setMethod] = useState<Method>(hasFace ? "face" : "pin");
	const [pin, setPin] = useState("");
	const [photo, setPhoto] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [faceKey, setFaceKey] = useState(0);
	const [faceFails, setFaceFails] = useState(0);
	const [camProblem, setCamProblem] = useState(false);
	const busyRef = useRef(false);

	const run = useCallback(async (p: VerifyPayload) => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		setError(null);
		try {
			await submit(p);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Verifikasi gagal");
			if (p.method === "pin") setPin("");
			throw e;
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [submit]);

	// Wajah gagal 3× → arahkan ke PIN + foto.
	useEffect(() => { if (faceFails >= 3) { setMethod("pin"); setFaceFails(0); } }, [faceFails]);

	const choose = (m: Method) => { setError(null); setPin(""); setPhoto(null); setMethod(m); if (m === "face") setFaceKey((k) => k + 1); };

	const press = (k: string) => {
		if (busy || locked || !photo) return;
		if (k === "⌫") return setPin((p) => p.slice(0, -1));
		if (pin.length >= 6) return;
		const next = pin + k;
		setPin(next);
		if (next.length === 6) void run({ method: "pin", pin: next, photo }).catch(() => undefined);
	};

	const tabs: [Method, string][] = [["face", "Wajah"], ["pin", "PIN + foto"], ...(allowPhotoOnly ? [["photo", "Foto"] as [Method, string]] : [])];

	return (
		<div>
			<div className="ds-seg" role="group" aria-label="Cara verifikasi" style={{ marginBottom: 10 }}>
				{tabs.map(([m, label]) => (
					<button key={m} type="button" aria-pressed={method === m} disabled={busy || (m === "face" && !hasFace)} onClick={() => choose(m)} style={m === "face" && !hasFace ? { opacity: 0.45 } : undefined}>{label}</button>
				))}
			</div>

			{method === "face" && (
				<>
					<Suspense fallback={<div className="kx-cam" style={{ display: "grid", placeItems: "center", color: "#fff", fontSize: 13 }}>Menyiapkan kamera…</div>}>
						<FaceScanner
							key={faceKey}
							mode="verify"
							stamp={stamp}
							onDone={async (d, p) => {
								try { await run({ method: "face", faceDescriptor: d, photo: p }); } catch (e) { setFaceFails((n) => n + 1); throw e; }
							}}
							onUnavailable={() => setCamProblem(true)}
						/>
					</Suspense>
					{camProblem && <div className="ds-note ds-note--info" style={{ marginTop: 10 }}><div style={{ flex: 1 }}>Kamera bermasalah. Coba lagi, atau pilih tab “PIN + foto” / “Foto”.</div></div>}
					{!hasFace && <p className="ds-sub" style={{ margin: "8px 4px 0" }}>Wajahmu belum terdaftar. Daftarkan di Profil → Wajah.</p>}
				</>
			)}

			{method === "pin" && (
				<>
					{!photo ? (
						<>
							<p className="ds-sub" style={{ margin: "0 4px 6px" }}>Langkah 1: ambil foto selfie dari kamera.</p>
							<LivePhotoCapture stamp={stamp} onPhoto={setPhoto} />
						</>
					) : (
						<>
							<div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 6px" }}>
								<img src={photo} alt="Foto selfie" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
								<span className="ds-sub" style={{ flex: 1 }}>Langkah 2: masukkan PIN 6 digit.</span>
								<button type="button" onClick={() => { setPhoto(null); setPin(""); }} style={{ background: "none", border: 0, color: "var(--ds-blue)", font: "500 13px var(--ds-font)", minHeight: 44 }}>Ganti foto</button>
							</div>
							<div className="kx-pins" aria-label={`PIN, ${pin.length} dari 6 digit`}>
								{Array.from({ length: 6 }, (_, i) => <i key={i} data-on={i === pin.length ? "" : undefined}>{i < pin.length ? "•" : ""}</i>)}
							</div>
							<p className="ds-sub kx-cen" style={{ margin: 0 }}>{locked ? "PIN terkunci sementara karena terlalu banyak salah." : busy ? "Memeriksa…" : "PIN 6 digit"}</p>
							{error && <div className="kx-err" role="alert">{error}</div>}
							<div className="kx-pad">
								{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <button key={k} type="button" onClick={() => press(k)} disabled={busy || locked}>{k}</button>)}
								<span />
								<button type="button" onClick={() => press("0")} disabled={busy || locked}>0</button>
								<button type="button" className="q" aria-label="Hapus" onClick={() => press("⌫")}>⌫</button>
							</div>
						</>
					)}
				</>
			)}

			{method === "photo" && (
				<>
					<p className="ds-sub" style={{ margin: "0 4px 6px" }}>Ambil foto selfie dari kamera. Atasan bisa melihatnya di laporan grup.</p>
					<LivePhotoCapture stamp={stamp} onPhoto={setPhoto} />
					{error && <div className="kx-err" role="alert">{error}</div>}
					<DsButton block disabled={!photo || busy} onClick={() => photo && void run({ method: "photo", photo }).catch(() => undefined)}>{busy ? "Mengirim…" : "Kirim absen"}</DsButton>
				</>
			)}
			{footer}
		</div>
	);
}
