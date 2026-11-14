import { DsButton, DsNote, DsSheet } from "@yumipos/web-shared/components/ds";

/** Sheet dari tombol Absen di tab bar. Absen masuk tetap lewat bot Telegram (verifikasi lokasi); keluar lewat Closing shift. */
export function AbsenSheet({ isIn, onClose, onClosing, onHistory }: { isIn: boolean; onClose: () => void; onClosing: () => void; onHistory: () => void }) {
	return (
		<DsSheet title={isIn ? "Absen keluar" : "Absen masuk"} onClose={onClose}>
			<p className="ds-sub" style={{ margin: "0 0 12px" }}>{isIn ? "Selesaikan closing shift lebih dulu: opname dan kebersihan wajib dikirim sebelum absen keluar." : "Absen masuk dilakukan lewat bot Telegram agar lokasi dan identitasmu terverifikasi."}</p>
			{isIn
				? <DsNote tone="info" icon={<span style={{ fontSize: 20 }}>📝</span>}><b>Closing shift dulu</b>Hitung stok, centang kebersihan, lalu kirim. Absen keluar tercatat otomatis.</DsNote>
				: <DsNote tone="info" icon={<span style={{ fontSize: 20 }}>📍</span>}><b>Harus di area toko</b>Bot akan meminta lokasi dan PIN atau wajah.</DsNote>}
			{isIn
				? <DsButton block onClick={onClosing}>Mulai closing shift</DsButton>
				: <DsButton block onClick={() => { window.open("https://t.me/yumihrdbot", "_blank"); onClose(); }}>Buka bot Telegram</DsButton>}
			<DsButton block variant="ghost" onClick={onHistory}>Lihat riwayat kehadiran</DsButton>
		</DsSheet>
	);
}
