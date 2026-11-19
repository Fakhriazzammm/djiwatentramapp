import { useEffect, useState } from "react";
import { DsButton } from "@djiwaapps/web-shared/components/ds";
import { ds3d } from "@djiwaapps/web-shared/components/ds";

export const GUIDE_EVENT = "kx-open-guide";
const key = (id: string) => `kx_guide_v1_${id}`;

export const guideSeen = (userId?: string) => { try { return !!userId && localStorage.getItem(key(userId)) === "1"; } catch { return true; } };
export const openGuide = () => window.dispatchEvent(new Event(GUIDE_EVENT));

type Step = { icon: Parameters<typeof ds3d>[0]; title: string; lead: string; items?: { n?: string; t: string; d?: string }[]; note?: string };

const STEPS: Step[] = [
	{
		icon: "employee-attendance-check-in",
		title: "Absen sekarang lewat aplikasi ini",
		lead: "Bot Telegram (Elora | HRD) tidak lagi dipakai untuk absen masuk dan keluar. Semua absen dilakukan di sini, dan laporannya otomatis masuk ke grup Report.",
		note: "Bot Telegram tetap bisa untuk melihat status, jadwal, dan rekap.",
	},
	{
		icon: "employee-profile",
		title: "Siapkan dulu (sekali saja)",
		lead: "Tiga hal ini membuat absenmu lancar:",
		items: [
			{ n: "1", t: "Izinkan lokasi", d: "Agar sistem tahu kamu ada di area toko." },
			{ n: "2", t: "Izinkan kamera & daftarkan wajah", d: "Profil → Wajah. Cukup ±20 detik. Tanpa wajah, kamu absen dengan PIN." },
			{ n: "3", t: "Ganti PIN bawaan", d: "Profil → PIN absen. Jangan bagikan PIN ke siapa pun." },
		],
	},
	{
		icon: "employee-attendance-check-in",
		title: "Cara absen masuk",
		lead: "Lakukan di toko, mulai 30 menit sebelum shift.",
		items: [
			{ n: "1", t: "Ketuk tombol hijau di tengah bawah" },
			{ n: "2", t: "Tunggu 3 cek hijau", d: "Lokasi di area toko · ada jadwal · sesi aman." },
			{ n: "3", t: "Verifikasi wajah atau PIN", d: "Hadapkan wajah ke kamera, atau masukkan 6 digit PIN." },
			{ n: "4", t: "Selesai", d: "Jam tercatat, laporan terkirim ke grup. Telat lebih dari 5 menit: pilih alasan dulu." },
		],
	},
	{
		icon: "employee-attendance-check-out",
		title: "Cara absen keluar",
		lead: "Absen keluar dilakukan lewat Closing Shift, sebelum pulang.",
		items: [
			{ n: "1", t: "Ketuk tombol merah di tengah bawah", d: "Lalu “Mulai closing shift”." },
			{ n: "2", t: "Isi opname stok (jika ada) dan checklist kebersihan" },
			{ n: "3", t: "Kirim laporan, lalu verifikasi wajah atau PIN", d: "Absen keluar tercatat otomatis dan laporan masuk ke grup." },
		],
	},
	{
		icon: "employee-recap",
		title: "Kalau ada kendala",
		lead: "Semua ada jalan keluarnya:",
		items: [
			{ t: "Di luar area toko", d: "Dekati toko lalu “Cek ulang”. Tugas di luar? Hubungi supervisor." },
			{ t: "Lupa absen keluar / salah jam", d: "Beranda atau Rekap → Ajukan koreksi. Supervisor yang menyetujui." },
			{ t: "Izin, cuti, tukar shift", d: "Beranda → “Butuh izin, cuti, atau tukar shift?”" },
			{ t: "Masuk lebih cepat", d: "Profil → Akun Google. Hubungkan sekali, lalu bisa masuk dengan Google." },
		],
	},
];

/** Panduan sekali lihat: tampil otomatis untuk yang baru daftar atau baru masuk kembali, bisa dibuka lagi dari Profil. */
export function OnboardingGuide({ userId, autoOpen }: { userId?: string; autoOpen: boolean }) {
	const [open, setOpen] = useState(false);
	const [i, setI] = useState(0);

	useEffect(() => { if (autoOpen && userId && !guideSeen(userId)) setOpen(true); }, [autoOpen, userId]);
	useEffect(() => {
		const h = () => { setI(0); setOpen(true); };
		window.addEventListener(GUIDE_EVENT, h);
		return () => window.removeEventListener(GUIDE_EVENT, h);
	}, []);

	if (!open) return null;
	const done = () => { try { if (userId) localStorage.setItem(key(userId), "1"); } catch { /* abaikan */ } setOpen(false); window.dispatchEvent(new Event("kx-guide-closed")); };
	const s = STEPS[i];
	const last = i === STEPS.length - 1;

	return (
		<div className="kx-full" role="dialog" aria-modal="true" aria-label="Panduan absen">
			<div className="kx-full-in" style={{ display: "flex", flexDirection: "column" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px" }}>
					<span className="ds-label">Langkah {i + 1} dari {STEPS.length}</span>
					<button type="button" onClick={done} style={{ background: "none", border: 0, color: "var(--ds-blue)", font: "500 14px var(--ds-font)", minHeight: 44 }}>Lewati</button>
				</div>
				<div className="ds-bar" style={{ margin: "0 4px 10px" }}><i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>

				<div className="kx-cen" style={{ paddingTop: 8 }}>
					<img src={ds3d(s.icon)} alt="" style={{ width: 96, height: 96, objectFit: "contain", margin: "0 auto" }} />
					<h1 className="ds-title" style={{ margin: "6px 0 4px", fontSize: 24 }}>{s.title}</h1>
					<p className="ds-sub" style={{ margin: "0 6px 10px", lineHeight: 1.5 }}>{s.lead}</p>
				</div>

				{s.items && (
					<div className="ds-group">
						{s.items.map((it, k) => (
							<div key={k} className="kx-step">
								{it.n && <span className="n">{it.n}</span>}
								<div><b>{it.t}</b>{it.d && <span>{it.d}</span>}</div>
							</div>
						))}
					</div>
				)}
				{s.note && <div className="ds-note ds-note--info"><div style={{ flex: 1 }}>{s.note}</div></div>}

				<div style={{ marginTop: "auto", paddingTop: 16, display: "grid", gap: 8 }}>
					<DsButton block onClick={() => (last ? done() : setI(i + 1))}>{last ? "Mulai pakai aplikasi" : "Lanjut"}</DsButton>
					{i > 0 && <DsButton block variant="ghost" onClick={() => setI(i - 1)}>Kembali</DsButton>}
				</div>
				<div style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 12 }} aria-hidden="true">
					{STEPS.map((_, k) => <i key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, background: k === i ? "var(--ds-navy)" : "var(--ds-line)", transition: "width .2s" }} />)}
				</div>
			</div>
		</div>
	);
}
