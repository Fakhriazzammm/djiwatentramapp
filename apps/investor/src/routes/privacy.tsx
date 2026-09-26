import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacy")({ component: InvestorPrivacy });

function InvestorPrivacy() {
  return (
    <main className="investor-page min-h-screen bg-djiwa-canvas px-4 pb-12 pt-[max(env(safe-area-inset-top),1rem)] sm:px-7 sm:pt-8">
      <article className="mx-auto max-w-3xl rounded-[26px] border border-djiwa-line bg-djiwa-surface p-5 shadow-sm sm:p-9">
        <Link to="/" className="investor-focus inline-flex min-h-11 items-center gap-2 rounded-full text-[12px] font-semibold text-djiwa-muted"><ArrowLeft size={16} /> Kembali</Link>
        <div className="mt-7 grid h-11 w-11 place-items-center rounded-2xl bg-djiwa-navy-mist text-djiwa-navy-soft"><ShieldCheck size={21} /></div>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.17em] text-djiwa-gold-deep">Privasi</p>
        <h1 className="investor-display mt-2 text-3xl font-semibold text-djiwa-ink">Privasi dan akses data investor</h1>
        <p className="mt-3 text-[12px] leading-6 text-djiwa-muted">Kami memakai akun Google untuk mengamankan proses masuk. Pengajuan minat meminta data seminimal mungkin. Login tidak membuka laporan privat secara otomatis; tim harus menyetujui akses terlebih dahulu.</p>

        <div className="mt-7 space-y-5">
          <section><h2 className="text-[14px] font-bold text-djiwa-navy">Data yang diproses</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-6 text-djiwa-muted"><li>Identitas dasar yang diberikan Google untuk autentikasi akun.</li><li>Jika Anda mengajukan akses: kota yang diminati dan pendekatan investasi (keduanya opsional), waktu persetujuan, versi persetujuan, dan status permintaan.</li><li>Log teknis minimum yang diperlukan untuk keamanan sesi dan pencegahan penyalahgunaan.</li></ul></section>
          <section><h2 className="text-[14px] font-bold text-djiwa-navy">Tujuan dan akses</h2><p className="mt-2 text-[12px] leading-6 text-djiwa-muted">Data digunakan untuk mengelola login, meninjau permintaan akses, dan menindaklanjuti minat investasi. Informasi permintaan hanya tersedia bagi pihak internal yang berwenang. Data keuangan investor adalah agregat yang dibatasi menurut status akses; data pelanggan, staf, dan transaksi mentah tidak ditampilkan.</p></section>
          <section><h2 className="text-[14px] font-bold text-djiwa-navy">Penyimpanan dan permintaan privasi</h2><p className="mt-2 text-[12px] leading-6 text-djiwa-muted">Jangka waktu penyimpanan dan kanal resmi untuk permintaan akses, koreksi, atau penghapusan data harus ditetapkan oleh pengelola Djiwa Tentram sebelum portal dibuka ke publik. Jangan gunakan portal produksi untuk mengirim data minat investor sampai informasi pengelola, retensi, dan kanal kontak tersebut dilengkapi dan disetujui.</p></section>
          <section className="rounded-2xl border border-djiwa-gold-border bg-djiwa-warning-soft p-4"><h2 className="text-[12px] font-bold text-djiwa-warning-ink">Catatan sebelum peluncuran</h2><p className="mt-1 text-[11px] leading-5 text-djiwa-warning-ink/80">Halaman ini adalah pemberitahuan implementasi awal, belum menggantikan kebijakan privasi final atau tinjauan hukum. Pemilik pengendali data, periode retensi, dan kontak hak subjek data masih memerlukan persetujuan internal.</p></section>
        </div>
      </article>
    </main>
  );
}
