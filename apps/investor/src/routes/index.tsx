import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Building2, Check, ChevronRight, CircleDollarSign, Compass, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({ component: InvestorLanding });

const proofPoints = [
  { icon: BarChart3, title: "Performa usaha aktual", description: "Ringkasan keuangan dan tren operasional bersumber dari sistem internal—bukan angka ilustratif." },
  { icon: Building2, title: "Ekspansi berbasis kesiapan", description: "Peluang kota dan tahap pengembangan hanya ditampilkan setelah melalui penilaian dan persetujuan." },
  { icon: ShieldCheck, title: "Akses data terkontrol", description: "Laporan lebih rinci tersedia di ruang investor setelah identitas Google diverifikasi dan akses disetujui." },
];

function InvestorLanding() {
  return (
    <main className="investor-page">
      <header className="investor-nav sticky top-0 z-30 border-b border-slate-200/70">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-7 lg:px-10">
          <a href="#top" className="investor-focus flex items-center gap-3 rounded-xl" aria-label="Djiwa Tentram Investor Relations">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#0d1b2a] text-sm font-extrabold tracking-tight text-[#e9d39b]">DT</span>
            <span className="leading-tight"><span className="block text-[13px] font-bold text-slate-900">Djiwa Tentram</span><span className="text-[10px] font-semibold uppercase tracking-[.17em] text-slate-500">Investor relations</span></span>
          </a>
          <nav className="hidden items-center gap-7 text-[13px] font-semibold text-slate-600 md:flex" aria-label="Navigasi utama">
            <a className="transition-colors hover:text-slate-950" href="#thesis">Tesis pertumbuhan</a>
            <a className="transition-colors hover:text-slate-950" href="#data">Data & transparansi</a>
            <a className="transition-colors hover:text-slate-950" href="#process">Proses investasi</a>
          </nav>
          <Link to="/dashboard" className="investor-focus inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0d1b2a] px-4 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#172a3d] active:scale-[.98] sm:px-5 sm:text-[13px]">
            <LockKeyhole size={15} aria-hidden="true" /> <span>Investor portal</span><ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section id="top" className="relative isolate overflow-hidden bg-[#0d1b2a] text-white">
        <div className="investor-grid absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="absolute -right-20 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-[#d4b46a]/10 blur-[90px]" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16 lg:px-10 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[11px] font-semibold text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d4b46a]" /> Investor relations · Private investment
            </div>
            <h1 className="investor-display max-w-[760px] text-[clamp(2.55rem,7vw,5.1rem)] font-semibold leading-[1.02] text-white">
              Tumbuh bersama. <span className="text-[#e7d39d]">Buka peluang baru.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-slate-300 sm:text-[17px] sm:leading-8">
              Djiwa Tentram membangun bisnis kuliner dan pengalaman pelanggan yang bertumpu pada operasional terukur. Kami membuka ruang dialog dengan investor individu dan private investment untuk menjajaki ekspansi secara bertanggung jawab.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#process" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e1c77f] px-6 text-sm font-bold text-[#132235] shadow-lg shadow-black/10 transition hover:bg-[#efd99b] active:scale-[.98]">
                Bahas peluang investasi <ArrowRight size={17} aria-hidden="true" />
              </a>
              <Link to="/dashboard" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/[.08]">
                Masuk dengan Google <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-[11px] leading-5 text-slate-400"><ShieldCheck size={14} className="shrink-0 text-[#d4b46a]" /> Akses laporan investor diberikan setelah proses verifikasi dan persetujuan.</p>
          </div>

          <aside className="relative mx-auto w-full max-w-[520px] lg:ml-auto" aria-label="Arah pengembangan usaha">
            <div className="rounded-[26px] border border-white/10 bg-white/[.06] p-4 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-slate-400">Growth framework</p><p className="mt-1 text-[16px] font-bold text-white">Ekspansi yang terukur</p></div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d4b46a]/15 text-[#e8d59f]"><Compass size={19} /></span>
              </div>
              <div className="space-y-3 pt-4">
                {[
                  ["01", "Validasi pasar", "Demand, demografi, dan potensi lokasi"],
                  ["02", "Kesiapan operasional", "Tim, pasokan, dan unit economics"],
                  ["03", "Kemitraan yang selaras", "Struktur investasi dibahas secara transparan"],
                ].map(([number, title, description]) => (
                  <div key={number} className="flex gap-3 rounded-2xl border border-white/[.07] bg-[#071320]/35 p-3.5 sm:p-4">
                    <span className="pt-0.5 text-[11px] font-bold tabular-nums text-[#d4b46a]">{number}</span>
                    <div className="min-w-0"><p className="text-[13px] font-bold text-white">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{description}</p></div>
                    <Check className="ml-auto mt-0.5 shrink-0 text-[#d4b46a]/80" size={15} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#e7d39d] p-3.5 text-[#142338] sm:p-4">
                <TrendingUp size={19} className="shrink-0" aria-hidden="true" />
                <p className="text-[11px] font-semibold leading-5">Laporan performa aktual tersedia untuk investor yang telah disetujui.</p>
                <CircleDollarSign size={19} className="ml-auto shrink-0 opacity-70" aria-hidden="true" />
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-500">Informasi ini bukan penawaran efek atau jaminan hasil investasi.</p>
          </aside>
        </div>
      </section>

      <section id="thesis" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8d7131]">Alasan untuk berdialog</p><h2 className="investor-display mt-3 max-w-md text-3xl font-semibold leading-tight text-[#102033] sm:text-4xl">Pertumbuhan harus dibangun di atas bukti.</h2></div>
          <p className="max-w-2xl text-[14px] leading-7 text-slate-600 sm:text-[15px]">Kami ingin calon investor dapat memahami cara bisnis berjalan, menilai kinerja aktual, dan mendiskusikan ekspansi dengan asumsi yang terbuka. Karena itu, ringkasan yang dibagikan selalu memiliki sumber data, periode, dan batasan yang jelas.</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
          {proofPoints.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="investor-panel p-5 sm:p-6">
              <div className={`grid h-10 w-10 place-items-center rounded-[14px] ${index === 1 ? "bg-[#f4eedf] text-[#8d7131]" : "bg-[#eef3fa] text-[#204e82]"}`}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></div>
              <h3 className="mt-5 text-[15px] font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-[12px] leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="data" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-10">
          <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8d7131]">Transparansi data</p><h2 className="investor-display mt-3 text-3xl font-semibold leading-tight text-[#102033] sm:text-4xl">Angka nyata. Konteks lengkap.</h2><p className="mt-4 text-[13px] leading-6 text-slate-600">Investor yang disetujui dapat melihat ringkasan keuangan dari database operasional, dengan periode, definisi, dan waktu pembaruan. Data pelanggan, karyawan, dan transaksi mentah tidak ditampilkan.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Ringkasan keuangan", "Ringkasan agregat dari sumber operasional, dengan periode dan definisi yang ditampilkan."],
              ["Target & progres", "Dibaca bersama definisi dan konteks target yang berlaku."],
              ["Performa operasional", "Metrik agregat; tanpa identitas pelanggan atau tim."],
              ["Pembaruan data", "Cap waktu dan status kelengkapan terlihat di setiap ringkasan."],
            ].map(([title, detail]) => <div key={title} className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4"><div className="flex items-start gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e7d39d]/50 text-[#7c642e]"><Check size={13} /></span><div><h3 className="text-[12px] font-bold text-slate-900">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-600">{detail}</p></div></div></div>)}
          </div>
        </div>
      </section>

      <section id="process" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="investor-panel relative overflow-hidden bg-[#fff] p-5 sm:p-8 lg:p-10">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-16 rounded-full bg-[#d4b46a]/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8d7131]">Langkah berikutnya</p><h2 className="investor-display mt-3 text-3xl font-semibold leading-tight text-[#102033] sm:text-4xl">Mulai dengan percakapan yang tepat.</h2><p className="mt-3 text-[13px] leading-6 text-slate-600">Ceritakan ketertarikan dan kota yang ingin Anda jelajahi. Tim Djiwa Tentram akan meninjau kecocokan dan menjadwalkan diskusi bila relevan.</p></div>
            <Link to="/dashboard" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0d1b2a] px-6 text-sm font-bold text-white transition hover:bg-[#172a3d] active:scale-[.98]">Mulai dengan Google <ArrowRight size={17} /></Link>
          </div>
          <div className="relative mt-8 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-3">
            {["Masuk dengan akun Google", "Ajukan akses atau minat", "Tim meninjau dan merespons"].map((step, i) => <div className="flex items-start gap-3" key={step}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d9c68f] text-[11px] font-bold text-[#7c642e]">{i + 1}</span><p className="pt-1 text-[11px] font-semibold leading-5 text-slate-700">{step}</p></div>)}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-[10px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>© {new Date().getFullYear()} Djiwa Tentram · Investor Relations</p>
          <div className="flex flex-col gap-2 sm:items-end"><Link to="/privacy" className="investor-focus min-h-8 rounded-md font-semibold underline underline-offset-2">Pemberitahuan privasi</Link><p className="max-w-2xl sm:text-right">Informasi untuk diskusi awal, bukan rekomendasi investasi atau penawaran efek. Semua peluang, asumsi, dan ketentuan investasi memerlukan verifikasi serta persetujuan tertulis.</p></div>
        </div>
      </footer>
    </main>
  );
}
