import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import { PaySheet, PrimaryButton } from "./pay-ui";

const FAQ: [string, string][] = [
	["Top up sudah dibayar tapi saldo belum masuk", "Saldo masuk otomatis setelah pembayaran QRIS terkonfirmasi, biasanya kurang dari 1 menit. Buka halaman Saldo dan tarik muat ulang. Jangan buat top up baru; kalau lebih dari 10 menit, hubungi CS dengan bukti pembayaran."],
	["Lupa PIN Djiwa Pay", "Buka Djiwa Pay > Akun > Keamanan > Lupa PIN, lalu verifikasi dengan kata sandi akun. PIN akan terkunci 15 menit setelah 5 kali salah."],
	["Transfer salah nomor", "Transfer saldo langsung masuk dan tidak bisa dibatalkan dari aplikasi. Hubungi CS secepatnya dengan nomor penerima dan waktu transfer."],
	["Pulsa atau token belum masuk", "Transaksi berstatus “Sedang diproses” bisa memakan beberapa menit. Bila gagal, saldo otomatis dikembalikan. Simpan kode atau SN yang tampil untuk laporan ke CS."],
	["Berapa batas transfer dan top up?", "Top up minimal Rp1.000. Transfer antar pengguna Rp1.000 sampai Rp10.000.000 per transaksi."],
];

export function HelpSheet({ open, onClose, username, phone }: { open: boolean; onClose: () => void; username: string; phone: string }) {
	const [openIdx, setOpenIdx] = useState<number | null>(0);
	const digits = phone.replace(/\D/g, "");
	const wa = digits ? `62${digits.replace(/^0/, "").replace(/^62/, "")}` : "";
	const href = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Halo Djiwa Tentram, saya butuh bantuan soal saldo. Akun: ${username}`)}` : "";
	return (
		<PaySheet open={open} title="Bantuan saldo" onClose={onClose}>
			<div className="divide-y divide-[#e4e8f1] rounded-3xl bg-[#f1f3f8] px-4">
				{FAQ.map(([q, a], i) => (
					<div key={q}>
						<button type="button" onClick={() => setOpenIdx(openIdx === i ? null : i)} aria-expanded={openIdx === i} className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-[14px] font-semibold"><span>{q}</span><motion.span animate={{ rotate: openIdx === i ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown className="h-4 w-4 text-[#6b7080]" /></motion.span></button>
						<AnimatePresence initial={false}>{openIdx === i && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden pb-3.5 text-[13px] leading-relaxed text-[#6b7080]">{a}</motion.p>}</AnimatePresence>
					</div>
				))}
			</div>
			{href ? <a href={href} target="_blank" rel="noopener noreferrer"><PrimaryButton><span className="flex items-center justify-center gap-2"><MessageCircle className="h-5 w-5" />Hubungi CS via WhatsApp</span></PrimaryButton></a> : <p className="mt-4 rounded-2xl bg-[#e6efff] px-3.5 py-3 text-xs text-[#1a4a9a]">Kontak CS belum tersedia. Datang langsung ke outlet Djiwa Tentram untuk bantuan.</p>}
		</PaySheet>
	);
}
