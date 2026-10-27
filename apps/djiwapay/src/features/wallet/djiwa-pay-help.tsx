import { CircleHelp, Clock3, Plus, ReceiptText, ShieldCheck } from "lucide-react";
import { DjiwaPayPageHeader } from "./djiwa-pay-page-header";

export function DjiwaPayHelp({ onBack, onNavigate }: { onBack: () => void; onNavigate: (path: string) => void }) {
  return <main className="pay-page wallet-help-page">
    <DjiwaPayPageHeader title="Bantuan" subtitle="Jawaban singkat untuk menggunakan Djiwa Pay dengan aman." onBack={onBack} />
    <section className="ios-help-hero" aria-label="Keamanan Djiwa Pay"><span><ShieldCheck size={24} /></span><div><strong>Transaksi Anda tetap terkendali</strong><p>Periksa penerima, nominal, dan status transaksi sebelum melanjutkan pembayaran.</p></div></section>
    <div className="ios-shortcut-grid" aria-label="Aksi bantuan"><button type="button" onClick={() => onNavigate("/wallet/topup")}><Plus size={20} /><span>Isi saldo</span></button><button type="button" onClick={() => onNavigate("/wallet/history")}><ReceiptText size={20} /><span>Lihat riwayat</span></button></div>
    <section className="ios-help-group" aria-labelledby="help-faq-title"><span className="ios-section-label" id="help-faq-title">PERTANYAAN UMUM</span><div className="ios-disclosure-list">
      <details><summary>Bagaimana cara mengisi saldo?<span>+</span></summary><p>Buka Isi Saldo, pilih atau masukkan nominal, lalu selesaikan pembayaran QRIS. Saldo masuk setelah pembayaran dikonfirmasi.</p></details>
      <details><summary>Mengapa saldo belum bertambah?<span>+</span></summary><p>Buka kembali halaman Isi Saldo untuk memeriksa status invoice. Jangan membuat pembayaran berulang selama status masih menunggu konfirmasi.</p></details>
      <details><summary>Bagaimana mengirim saldo dengan aman?<span>+</span></summary><p>Masukkan nomor HP penerima lalu tekan Cek penerima. Pastikan nama yang terverifikasi sudah benar sebelum mengirim.</p></details>
      <details><summary>Di mana melihat bukti transaksi?<span>+</span></summary><p>Semua aktivitas saldo tersedia di Riwayat. Pilih transaksi untuk melihat waktu, nominal, pihak terkait, dan ID transaksi.</p></details>
    </div></section>
    <p className="ios-help-footnote"><Clock3 size={15} />Status provider dapat memerlukan waktu untuk diperbarui.</p>
    <div className="ios-help-assurance"><CircleHelp size={17} /><span>Simpan ID transaksi saat memerlukan penelusuran lebih lanjut.</span></div>
  </main>;
}
