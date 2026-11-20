import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { DsButton, DsIcon, DsNote, DsSheet, DsTag } from "@djiwaapps/web-shared/components/ds";
import { AttendanceError, clockIn, getPosition, preflight, reportEvent, type ClockInResult, type GeoPoint, type Preflight } from "@/lib/attendance-api";
import { VerifyIdentity, type VerifyPayload } from "@/components/karyawan/VerifyIdentity";

type CheckState = "ok" | "bad" | "wait" | "idle";
const ICON: Record<CheckState, ReactElement> = {
	ok: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
	bad: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
	wait: <span className="kx-spin" />,
	idle: <span />,
};
const Check = ({ s, title, sub }: { s: CheckState; title: string; sub: string }) => (
	<div className="kx-check" data-s={s}><div className="d">{ICON[s]}</div><div style={{ flex: 1, minWidth: 0 }}><b>{title}</b><span className="s">{sub}</span></div></div>
);

const REASONS = ["Macet", "Kendaraan rusak", "Sakit ringan", "Urusan keluarga", "Lainnya"];
const clock = (ts: number) => new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }).replace(/\./g, ":");
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

type Props = {
	/** Sudah absen masuk? Maka sheet ini mengarahkan ke closing shift (absen keluar). */
	isIn: boolean;
	token: string | null;
	onClose: () => void;
	onClosing: () => void;
	onHistory: () => void;
	/** Dipanggil setelah absen masuk tercatat, agar Beranda dan tombol tengah ikut berubah. */
	onRecorded: () => void;
};

/**
 * Tombol Absen di tab bar. Masuk: cek lokasi/jadwal/perangkat → (alasan telat) → verifikasi wajah atau PIN
 * → hasil. Keluar: cek lokasi, lalu closing shift (verifikasi dilakukan di akhir closing).
 * Bot Telegram hanya cadangan.
 */
export function AbsenSheet({ isIn, token, onClose, onClosing, onHistory, onRecorded }: Props) {
	const [phase, setPhase] = useState<"check" | "late" | "verify" | "done">("check");
	const [pre, setPre] = useState<Preflight | null>(null);
	const [geoErr, setGeoErr] = useState<"denied" | "unavailable" | "timeout" | "unsupported" | null>(null);
	const [point, setPoint] = useState<GeoPoint | null>(null);
	const [loading, setLoading] = useState(true);
	const [fatal, setFatal] = useState<string | null>(null);
	const [reason, setReason] = useState<string>("");
	const [note, setNote] = useState("");
	const [swapId, setSwapId] = useState<string | null>(null);
	const [result, setResult] = useState<ClockInResult["log"] | null>(null);
	const [now, setNow] = useState(Date.now());
	const seq = useRef(0);

	useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

	const run = useCallback(async () => {
		const my = ++seq.current;
		setLoading(true); setFatal(null); setGeoErr(null);
		const g = await getPosition();
		if (my !== seq.current) return;
		const p = g.ok ? g.point : null;
		setPoint(p);
		if (!g.ok) { setGeoErr(g.reason); reportEvent("location", g.reason); }
		try {
			const r = await preflight(token, p);
			if (my === seq.current) setPre(r);
		} catch (e) {
			if (my === seq.current) setFatal(e instanceof Error ? e.message : "Gagal memeriksa absen");
		} finally {
			if (my === seq.current) setLoading(false);
		}
	}, [token]);
	useEffect(() => { void run(); }, [run]);

	const geoState: CheckState = loading ? "wait" : geoErr || !pre ? "bad" : pre.geo.state === "ok" ? "ok" : "bad";
	const geoSub = loading ? "Mencari lokasimu…"
		: geoErr === "denied" ? "Izin lokasi ditolak"
		: geoErr ? "Lokasi tidak tersedia"
		: !pre ? "—"
		: pre.geo.state === "far" ? `${pre.geo.distance} m dari toko · batas ${pre.geo.radius} m`
		: pre.geo.state === "inaccurate" ? `Sinyal GPS lemah (±${pre.geo.accuracy} m)`
		: pre.geo.distance != null ? `Jarak ${pre.geo.distance} m (±${pre.geo.accuracy ?? 0} m)` : "Lokasi terdeteksi";
	const geoTitle = !loading && pre?.geo.state === "far" ? "Di luar area toko" : !loading && geoErr === "denied" ? "Lokasi dimatikan" : "Di area toko";

	const blocked = !!pre && (pre.noSchedule || pre.win === "early" || pre.outOfSchedule);
	const swapOpt = pre?.swapOptions.find((o) => o.userId === swapId) ?? null;
	const scheduleState: CheckState = loading ? "wait" : !pre ? "idle" : swapOpt ? "ok" : blocked ? "bad" : "ok";
	const scheduleSub = loading ? "Memeriksa jadwal…" : !pre ? "—"
		: swapOpt ? `Pindah ke shift ${swapOpt.shift} ${hhmm(swapOpt.start)} – ${hhmm(swapOpt.end)} (gantikan ${swapOpt.name})`
		: pre.noSchedule ? "Tidak ada shift untukmu hari ini"
		: pre.win === "early" ? `Belum waktunya absen, dibuka 30 menit sebelum ${hhmm(pre.shift?.start_time)}`
		: pre.outOfSchedule ? "Di luar jadwalmu"
		: pre.shift ? `${pre.shift.shift_name} ${hhmm(pre.shift.start_time)} – ${hhmm(pre.shift.end_time)}` : "Jadwal terbuka";

	const ready = !loading && !!pre && !geoErr && pre.geo.state === "ok" && !pre.isIn && (swapOpt ? true : !blocked);
	const needReason = !!pre?.needsLateReason && !swapOpt;

	const submit = useCallback(async (v: VerifyPayload) => {
		try {
			const res = await clockIn(token, {
				location: point, method: v.method,
				pin: v.method === "pin" ? v.pin : undefined,
				faceDescriptor: v.method === "face" ? v.faceDescriptor : undefined,
				photo: v.photo,
				swapWithUserId: swapOpt?.userId,
				lateReason: reason ? `${reason}${note ? ` — ${note}` : ""}` : undefined,
			});
			setResult(res.log);
			setPhase("done");
			onRecorded();
		} catch (e) {
			if (e instanceof AttendanceError && ["OUTSIDE_RADIUS", "NO_SCHEDULE", "TOO_EARLY", "LOCATION_REQUIRED", "LOCATION_INACCURATE", "ALREADY_IN", "SWAP_UNAVAILABLE"].includes(e.code)) {
				setSwapId(null);
				setPhase("check");
				void run();
			}
			throw e;
		}
	}, [token, point, reason, note, swapOpt, onRecorded, run]);

	/* ── Keluar: closing dulu ───────────────────────────────── */
	if (isIn) {
		return (
			<DsSheet title="Absen keluar" onClose={onClose}>
				<p className="ds-sub" style={{ margin: "0 0 8px" }}>Selesaikan closing shift lebih dulu. Opname dan kebersihan wajib dikirim, lalu verifikasi di langkah akhir.</p>
				<Check s="idle" title="Closing shift" sub="Opname stok · kebersihan · verifikasi" />
				<Check s={geoState} title={geoTitle} sub={geoSub} />
				<DsNote tone="info" icon={<DsIcon name="stock-opname" />}><b>Verifikasi di akhir</b>Wajah, atau PIN/foto langsung dari kamera, diminta setelah closing terkirim.</DsNote>
				<DsButton block onClick={onClosing}>Mulai closing shift</DsButton>
				<DsButton block variant="ghost" onClick={onHistory}>Lihat riwayat kehadiran</DsButton>
			</DsSheet>
		);
	}

	/* ── Masuk: hasil ───────────────────────────────────────── */
	if (phase === "done" && result) {
		return (
			<div className="kx-full" role="dialog" aria-modal="true" aria-label="Absen masuk tercatat">
				<div className="kx-full-in">
					<div className="kx-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
					<h2 className="ds-title kx-cen" style={{ margin: "4px 0 2px" }}>Absen masuk tercatat</h2>
					<p className="ds-sub kx-cen">{new Date(result.timestamp).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" })} · {clock(result.timestamp)}</p>
					<div className="ds-group" style={{ marginTop: 12 }}>
						<div className="kx-kv"><span>Status</span><b><DsTag tone={result.onTime ? "ok" : "warn"}>{result.onTime ? "Tepat waktu" : `Telat ${result.lateMin} menit`}</DsTag></b></div>
						{!!result.penaltyAmount && <div className="kx-kv"><span>Potongan shift</span><b>Rp{result.penaltyAmount.toLocaleString("id-ID")}</b></div>}
						{result.shiftName && <div className="kx-kv"><span>Shift</span><b>{result.shiftName}</b></div>}
						{result.distance != null && <div className="kx-kv"><span>Lokasi</span><b>{result.distance} m dari toko</b></div>}
						{result.swappedWith && <div className="kx-kv"><span>Pindah shift</span><b>Gantikan {result.swappedWith}</b></div>}
						<div className="kx-kv"><span>Verifikasi</span><b>{result.method === "face" ? "Wajah" : result.method === "photo" ? "Foto langsung" : "PIN + foto"}</b></div>
						<div className="kx-kv"><span>Laporan grup</span><b>{result.reported ? "Terkirim ✓" : "Belum terkirim"}</b></div>
					</div>
					<DsNote tone="info" icon={<DsIcon name="shift-closing" />}><b>Jangan lupa closing shift</b>Opname dan kebersihan wajib sebelum absen keluar.</DsNote>
					<DsButton block onClick={onClose}>Ke Beranda</DsButton>
				</div>
			</div>
		);
	}

	/* ── Masuk: verifikasi ──────────────────────────────────── */
	if (phase === "verify" && pre) {
		return (
			<div className="kx-full" role="dialog" aria-modal="true" aria-label="Verifikasi absen">
				<div className="kx-full-in">
					<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0 10px" }}>
						<button type="button" className="ds-iconbtn" aria-label="Kembali" onClick={() => setPhase(needReason ? "late" : "check")}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg></button>
						<h1 className="ds-page" style={{ margin: 0, fontSize: 26 }}>Verifikasi</h1>
					</div>
					<p className="ds-sub" style={{ margin: "0 4px 6px" }}>Absen masuk · {clock(now)}</p>
					<VerifyIdentity hasFace={pre.hasFace} locked={pre.lockedPin} submit={submit} />
					<div className="ds-group" style={{ marginTop: 12 }}>
						{swapOpt && <div className="kx-kv"><span>Pindah shift</span><b>{swapOpt.shift} {hhmm(swapOpt.start)} – {hhmm(swapOpt.end)}</b></div>}
						{!swapOpt && pre.shift && <div className="kx-kv"><span>Shift</span><b>{pre.shift.shift_name} {hhmm(pre.shift.start_time)} – {hhmm(pre.shift.end_time)}</b></div>}
						{pre.geo.distance != null && <div className="kx-kv"><span>Lokasi</span><b>{pre.geo.distance} m dari toko</b></div>}
					</div>
				</div>
			</div>
		);
	}

	/* ── Masuk: alasan terlambat ────────────────────────────── */
	if (phase === "late" && pre) {
		return (
			<DsSheet title={`Kamu terlambat ${pre.lateMin} menit`} onClose={onClose}>
				<p className="ds-sub" style={{ margin: "0 0 8px" }}>Absen tetap tercatat. Pilih alasan agar supervisor mengerti.</p>
				<div className="kx-reasons">{REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
				<label className="kx-field"><span>Catatan singkat (opsional)</span><input className="kx-input" value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Contoh: jalan ditutup" /></label>
				<DsButton block disabled={!reason} onClick={() => setPhase("verify")}>Lanjut verifikasi</DsButton>
			</DsSheet>
		);
	}

	/* ── Masuk: cek ─────────────────────────────────────────── */
	const far = pre?.geo.state === "far";
	return (
		<DsSheet title="Absen masuk" onClose={onClose}>
			<p className="ds-sub" style={{ margin: "0 0 4px" }}>{loading ? "Memeriksa…" : ready ? "Semua siap. Lanjut verifikasi." : "Selesaikan dulu yang merah."}</p>
			{far && point && (
				<div className="kx-map" aria-hidden="true">
					<div className="fence" style={{ width: 90, height: 90, left: "58%", top: "30%" }} />
					<div className="me" style={{ left: "16%", top: "62%" }} />
					<span className="lbl">{pre?.geo.distance} m dari toko · batas {pre?.geo.radius} m</span>
				</div>
			)}
			<Check s={geoState} title={geoTitle} sub={geoSub} />
			<Check s={scheduleState} title={pre?.noSchedule ? "Tidak ada jadwal" : "Ada jadwal"} sub={scheduleSub} />
			<Check s={loading ? "wait" : fatal ? "bad" : pre?.isIn ? "bad" : "ok"} title="Perangkat & sesi" sub={fatal ?? (pre?.isIn ? "Kamu sudah absen masuk" : loading ? "Memeriksa…" : "Siap")} />
			{!loading && blocked && pre && (
				<>
					{pre.swapOptions.length > 0 ? (
						<DsNote tone="info"><b>Tukar shift dengan rekan?</b>Pilih rekan yang bertukar denganmu. Jadwal langsung berganti dan atasan diberi tahu.</DsNote>
					) : (
						<DsNote><b>Belum bisa absen</b>{pre.win === "early" ? "Tunggu waktu absen dibuka." : "Tidak ada rekan yang bisa digantikan hari ini. Hubungi supervisor."}</DsNote>
					)}
					{pre.swapOptions.length > 0 && (
						<div className="kx-reasons">
							{pre.swapOptions.map((o) => <button key={o.userId} type="button" aria-pressed={swapId === o.userId} onClick={() => setSwapId(swapId === o.userId ? null : o.userId)}>{o.name} · {hhmm(o.start)}–{hhmm(o.end)}</button>)}
						</div>
					)}
				</>
			)}
			{geoErr === "denied" && (
				<DsNote icon={<DsIcon name="employee-attendance-check-in" />}><b>Aktifkan lokasi</b>Izinkan lokasi untuk situs ini (ikon gembok di address bar → Izin → Lokasi). Jika muncul “Situs ini tidak dapat meminta izin Anda”, tutup gelembung/overlay di layar (chat head, perekam layar, filter cahaya biru) lalu cek ulang.</DsNote>
			)}
			{(geoErr === "timeout" || geoErr === "unavailable") && (
				<DsNote icon={<DsIcon name="employee-attendance-check-in" />}><b>Lokasi belum terbaca</b>Nyalakan GPS/Layanan Lokasi dan mode akurasi tinggi, lalu cek ulang. Di dalam gedung, dekati jendela atau pintu.</DsNote>
			)}
			{!loading && pre && !pre.hasFace && ready && <DsNote tone="info"><b>Wajah belum terdaftar</b>Kamu akan absen dengan PIN + foto atau foto langsung. Daftarkan wajah di Profil › Scan wajah.</DsNote>}
			<DsButton block disabled={loading} onClick={() => (ready ? setPhase(needReason ? "late" : "verify") : void run())}>
				{loading ? "Memeriksa…" : ready ? (swapOpt ? "Pindah shift & verifikasi" : "Lanjut verifikasi") : geoErr === "denied" ? "Cek ulang lokasi" : "Cek ulang"}
			</DsButton>
			{!loading && !ready && <DsButton block variant="ghost" onClick={onHistory}>Lihat riwayat kehadiran</DsButton>}
		</DsSheet>
	);
}
