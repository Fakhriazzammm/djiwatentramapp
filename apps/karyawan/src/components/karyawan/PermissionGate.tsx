import { useEffect, useState } from "react";
import { DsButton, DsGroup, DsIcon, DsNote, DsRow, DsTag, ds3d } from "@djiwaapps/web-shared/components/ds";

type P = "granted" | "denied" | "prompt" | "unsupported";
const KEY = "kx_perm_done_v1";

async function query(name: "geolocation" | "camera" | "notifications"): Promise<P> {
	try {
		if (name === "notifications" && typeof Notification !== "undefined") return Notification.permission === "default" ? "prompt" : (Notification.permission as P);
		const r = await navigator.permissions?.query({ name: name as PermissionName });
		return (r?.state as P) ?? "prompt";
	} catch {
		return "prompt";
	}
}

/** Layar sekali pakai setelah login pertama: minta lokasi, kamera, notifikasi satu per satu dengan alasan jelas. */
export function PermissionGate({ hasFace, onEnroll }: { hasFace: boolean; onEnroll: () => void }) {
	const [show, setShow] = useState(false);
	const [loc, setLoc] = useState<P>("prompt");
	const [cam, setCam] = useState<P>("prompt");
	const [note, setNote] = useState<P>("prompt");

	useEffect(() => {
		try { if (localStorage.getItem(KEY) === "1") return; } catch { /* abaikan */ }
		void Promise.all([query("geolocation"), query("camera"), query("notifications")]).then(([l, c, n]) => {
			setLoc(l); setCam(c); setNote(n);
			// Semua sudah diputuskan sebelumnya: tidak perlu layar ini.
			if (l !== "prompt" && c !== "prompt" && n !== "prompt") { try { localStorage.setItem(KEY, "1"); } catch { /* */ } return; }
			setShow(true);
		});
	}, []);

	const done = () => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } setShow(false); };

	const grant = async () => {
		if (loc === "prompt") {
			setLoc(await new Promise<P>((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(() => res("granted"), (e) => res(e.code === 1 ? "denied" : "granted"), { timeout: 8000 }) : res("unsupported")));
		}
		if (cam === "prompt") {
			try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }); s.getTracks().forEach((t) => t.stop()); setCam("granted"); } catch { setCam("denied"); }
		}
		if (note === "prompt" && typeof Notification !== "undefined") {
			try { setNote((await Notification.requestPermission()) as P); } catch { setNote("denied"); }
		}
	};

	if (!show) return null;
	const tag = (p: P) => <DsTag tone={p === "granted" ? "ok" : p === "denied" ? "danger" : "warn"}>{p === "granted" ? "Diizinkan" : p === "denied" ? "Ditolak" : "Perlu"}</DsTag>;
	const decided = loc !== "prompt" && cam !== "prompt";

	return (
		<div className="kx-full" role="dialog" aria-modal="true" aria-label="Siapkan absenmu">
			<div className="kx-full-in">
				<div className="kx-cen" style={{ paddingTop: 12 }}>
					<img src={ds3d("employee-attendance-check-in")} alt="" style={{ width: 96, height: 96, objectFit: "contain", margin: "0 auto" }} />
					<h1 className="ds-page" style={{ fontSize: 26, margin: "4px 0" }}>Siapkan absenmu</h1>
					<p className="ds-sub">Tiga izin ini agar absen di app bisa terverifikasi.</p>
				</div>
				<DsGroup>
					<DsRow icon={<DsIcon name="employee-attendance-check-in" />} title="Lokasi" sub="Memastikan kamu di area toko" trail={tag(loc)} />
					<DsRow icon={<DsIcon name="employee-profile" />} title="Kamera" sub="Verifikasi wajah saat absen" trail={tag(cam)} />
					<DsRow icon={<DsIcon name="notifications-alerts" />} title="Notifikasi" sub="Pengingat shift & persetujuan" trail={tag(note)} />
				</DsGroup>
				{!hasFace && <DsNote tone="info" icon={<DsIcon name="employee-profile" />}><b>Wajah belum terdaftar</b>Daftarkan sekali (±20 detik). Tanpa itu kamu tetap bisa absen dengan PIN.</DsNote>}
				{(loc === "denied" || cam === "denied") && <DsNote icon={<DsIcon name="notifications-alerts" />}><b>Izin ditolak</b>Buka Pengaturan browser/app untuk situs ini, izinkan lokasi dan kamera, lalu muat ulang.</DsNote>}
				{!decided
					? <DsButton block onClick={grant}>Izinkan lokasi &amp; kamera</DsButton>
					: <DsButton block onClick={() => { done(); if (!hasFace && cam === "granted") onEnroll(); }}>{!hasFace && cam === "granted" ? "Daftarkan wajah" : "Selesai"}</DsButton>}
				<DsButton block variant="ghost" onClick={done}>Lewati, pakai PIN saja</DsButton>
			</div>
		</div>
	);
}
