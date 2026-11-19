import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DsButton } from "@djiwaapps/web-shared/components/ds";

const FaceRecognition = lazy(() => import("@/components/auth/FaceRecognition").then((m) => ({ default: m.FaceRecognition })));

export type VerifyPayload = { method: "face"; faceDescriptor: number[] } | { method: "pin"; pin: string };

/**
 * Verifikasi identitas untuk absen: wajah (kamera depan) atau PIN 6 digit.
 * `submit` melempar Error(message) bila server menolak; pesannya ditampilkan di sini.
 * Wajah selalu dicocokkan di server, bukan di perangkat.
 */
export function VerifyIdentity({ hasFace, submit, locked, footer }: { hasFace: boolean; submit: (p: VerifyPayload) => Promise<void>; locked?: boolean; footer?: ReactNode }) {
	const [method, setMethod] = useState<"face" | "pin">(hasFace ? "face" : "pin");
	const [pin, setPin] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [faceKey, setFaceKey] = useState(0);
	const [faceFails, setFaceFails] = useState(0);
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

	// Wajah gagal 3× → arahkan ke PIN.
	useEffect(() => { if (faceFails >= 3) { setMethod("pin"); setFaceFails(0); } }, [faceFails]);

	const press = (k: string) => {
		if (busy || locked) return;
		if (k === "⌫") return setPin((p) => p.slice(0, -1));
		if (pin.length >= 6) return;
		const next = pin + k;
		setPin(next);
		if (next.length === 6) void run({ method: "pin", pin: next }).catch(() => undefined);
	};

	return (
		<div>
			{method === "face" ? (
				<>
					<div className="kx-cam">
						<Suspense fallback={<div style={{ height: "100%", display: "grid", placeItems: "center", color: "#fff", fontSize: 13 }}>Menyiapkan kamera…</div>}>
							<FaceRecognition
								key={faceKey}
								mode="verify"
								onVerify={async (d) => {
									try { await run({ method: "face", faceDescriptor: d }); } catch (e) { setFaceFails((n) => n + 1); throw e; }
								}}
								onModelError={(m) => setError(m)}
							/>
						</Suspense>
					</div>
					{error && <div className="kx-err" role="alert">{error}</div>}
					<div style={{ display: "grid", gap: 8, marginTop: 10 }}>
						{error && <DsButton block onClick={() => { setError(null); setFaceKey((k) => k + 1); }}>Coba lagi</DsButton>}
						<DsButton block variant="ghost" onClick={() => { setError(null); setMethod("pin"); }}>Pakai PIN</DsButton>
					</div>
				</>
			) : (
				<>
					<div className="kx-pins" aria-label={`PIN, ${pin.length} dari 6 digit`}>
						{Array.from({ length: 6 }, (_, i) => <i key={i} data-on={i === pin.length ? "" : undefined}>{i < pin.length ? "•" : ""}</i>)}
					</div>
					<p className="ds-sub kx-cen" style={{ margin: 0 }}>{locked ? "PIN terkunci sementara karena terlalu banyak salah." : busy ? "Memeriksa…" : "PIN 6 digit"}</p>
					{error && <div className="kx-err" role="alert">{error}</div>}
					<div className="kx-pad">
						{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <button key={k} type="button" onClick={() => press(k)} disabled={busy || locked}>{k}</button>)}
						{hasFace ? <button type="button" className="q" onClick={() => { setError(null); setFaceKey((k) => k + 1); setMethod("face"); }}>Pakai wajah</button> : <span />}
						<button type="button" onClick={() => press("0")} disabled={busy || locked}>0</button>
						<button type="button" className="q" aria-label="Hapus" onClick={() => press("⌫")}>⌫</button>
					</div>
				</>
			)}
			{footer}
		</div>
	);
}
