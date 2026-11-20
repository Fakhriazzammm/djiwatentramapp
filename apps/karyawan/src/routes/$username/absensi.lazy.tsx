import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { DsButton, DsGroup, DsGroupLabel, DsIcon, DsIconButton, DsNote, DsPageTitle, DsRow, DsTag, ds3d } from "@djiwaapps/web-shared/components/ds";
import { toast } from "sonner";
import { useStaffProfile } from "../$username.lazy";
import { AttendanceError, enrollFace } from "@/lib/attendance-api";

const FaceScanner = lazy(() => import("@/components/karyawan/FaceScanner").then((m) => ({ default: m.FaceScanner })));

export const Route = createLazyFileRoute("/$username/absensi")({ component: AbsensiPage });

function AbsensiPage() {
	const { username, navigate, authUser, today, openAbsen } = useStaffProfile();
	const search = useSearch({ strict: false }) as { enroll?: number };
	const [enrolling, setEnrolling] = useState(search.enroll === 1);
	const hasFace = Boolean(authUser?.hasFace);
	const go = (to: string) => navigate({ to: `/$username/${to}` as any, params: { username } } as any);

	if (enrolling) return <Enroll onClose={() => setEnrolling(false)} />;

	const label = today.isIn ? "Sedang bertugas" : today.finished ? "Absen hari ini selesai" : "Belum absen";
	return (
		<>
			<DsPageTitle>Absensi</DsPageTitle>
			<div className="ds-hero">
				<img className="ds-hero-art" src={ds3d(today.isIn ? "employee-attendance-check-out" : "employee-attendance-check-in")} alt="" />
				<small>{authUser?.name}</small>
				<h3>{label}</h3>
				{!today.finished && <DsButton block onClick={openAbsen}>{today.isIn ? "Closing shift & absen keluar" : "Absen masuk"}</DsButton>}
			</div>
			<DsGroupLabel>Verifikasi</DsGroupLabel>
			<DsGroup white>
				<DsRow icon={<DsIcon name="employee-profile" />} title="Wajah" sub={hasFace ? "Terdaftar · dipakai untuk absen" : "Belum terdaftar · absen memakai PIN"} trail={<DsTag tone={hasFace ? "ok" : "warn"}>{hasFace ? "Aktif" : "Daftar"}</DsTag>} chevron onClick={() => setEnrolling(true)} />
				<DsRow icon={<DsIcon name="employee-contract" />} title="PIN absen" sub="Ganti PIN di Profil" chevron onClick={() => go("profil")} />
			</DsGroup>
			<DsGroupLabel>Riwayat</DsGroupLabel>
			<DsGroup white>
				<DsRow icon={<DsIcon name="employee-recap" />} title="Rekap kehadiran" sub="Hari, jam, dan koreksi" chevron onClick={() => go("rekap-absensi")} />
				<DsRow icon={<DsIcon name="employee-telegram" />} title="Bot Telegram" sub="Cadangan bila absen di app tak bisa" chevron onClick={() => window.open("https://t.me/yumihrdbot", "_blank")} />
			</DsGroup>
		</>
	);
}

/** Daftar / perbarui wajah: pindai → konfirmasi PIN → simpan di server. */
function Enroll({ onClose }: { onClose: () => void }) {
	const { token, navigate, username } = useStaffProfile();
	const [desc, setDesc] = useState<number[] | null>(null);
	const [pin, setPin] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const save = async () => {
		if (!desc || pin.length !== 6) return;
		setBusy(true); setErr(null);
		try {
			await enrollFace(token, { faceDescriptor: desc, pin });
			toast.success("Wajah tersimpan");
			// Sesi menyimpan hasFace saat login; muat ulang agar status baru terbaca.
			window.location.assign(`/${username}/absensi`);
		} catch (e) {
			setErr(e instanceof AttendanceError || e instanceof Error ? e.message : "Gagal menyimpan wajah");
			setPin("");
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={onClose}>‹</DsIconButton>}>Daftarkan wajah</DsPageTitle>
			{!desc ? (
				<>
					<p className="ds-sub" style={{ margin: "0 4px 8px" }}>Hadap kamera di tempat terang, wajah di dalam lingkaran. Tahan sebentar sampai terbaca (±5 detik).</p>
					<Suspense fallback={<div className="kx-cam" style={{ display: "grid", placeItems: "center", color: "#fff", fontSize: 13 }}>Menyiapkan kamera…</div>}>
						<FaceScanner mode="enroll" onDone={async (d) => { setDesc(d); }} />
					</Suspense>
					{err && <div className="kx-err" role="alert">{err}</div>}
				</>
			) : (
				<>
					<DsNote tone="ok" icon={<DsIcon name="employee-profile" />}><b>Wajah terbaca</b>Masukkan PIN untuk menyimpan.</DsNote>
					<label className="kx-field"><span>PIN absen (6 digit)</span><input id="enroll-pin" className="kx-input" inputMode="numeric" autoComplete="off" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
					{err && <div className="kx-err" role="alert">{err}</div>}
					<DsButton block disabled={pin.length !== 6 || busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan wajah"}</DsButton>
					<DsButton block variant="ghost" onClick={() => { setDesc(null); setPin(""); setErr(null); }}>Ulangi pemindaian</DsButton>
				</>
			)}
		</>
	);
}
