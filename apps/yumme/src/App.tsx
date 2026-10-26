import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Code2,
  Handshake,
  Menu,
  Store,
  Users,
  X,
} from "lucide-react";

type Icon = typeof Store;

type Package = {
  slug: string;
  aliases?: string[];
  name: string;
  price: string;
  note: string;
  items: string[];
};

type Offer = {
  number: string;
  slug: string;
  aliases?: string[];
  title: string;
  text: string;
  detail: string;
  outcome: string;
  items: string[];
  icon: Icon;
  tone: string;
  packages: Package[];
};

const offers: Offer[] = [
  {
    number: "01",
    slug: "it",
    aliases: ["operasional", "sistem"],
    title: "Sistem IT untuk bisnis F&B",
    text: "Buat pesanan, kasir, stok, dan laporan bekerja dalam satu alur.",
    detail: "Kami membangun sistem digital yang membantu pelanggan memesan, tim bekerja, dan pemilik melihat kondisi bisnis.",
    outcome: "Pekerjaan lebih cepat, data lebih rapi, dan keputusan bisnis tidak lagi menunggu rekap manual.",
    items: ["Menu, pesanan, dan pembayaran", "Kasir, stok, dan HPP", "Dashboard dan laporan bisnis"],
    icon: Code2,
    tone: "sage",
    packages: [
      { slug: "fitur-digital-sesuai-kebutuhan", aliases: ["menu-online-dan-website"], name: "Fitur digital sesuai kebutuhan", price: "Rp5 juta / fitur", note: "satu kali pekerjaan", items: ["Satu fokus sistem utama", "Satu alur kerja yang jelas", "Siap dipakai sesuai kebutuhan bisnis"] },
      { slug: "sistem-pesan-dan-bayar", name: "Sistem pesan dan bayar", price: "Rp35 juta", note: "mulai dari", items: ["Menu dan keranjang", "Pembayaran dan status pesanan", "Riwayat pesanan pelanggan"] },
      { slug: "sistem-bisnis-terintegrasi", aliases: ["integrasi-kasir-dan-dashboard"], name: "Sistem bisnis terintegrasi", price: "Rp20 juta", note: "mulai dari", items: ["Pesanan masuk ke kasir", "Stok dan laporan terhubung", "Akses untuk setiap tim"] },
    ],
  },
  {
    number: "02",
    slug: "marketing",
    aliases: ["akuisisi"],
    title: "Marketing dan akuisisi pelanggan",
    text: "Datangkan pelanggan baru dengan promosi yang terarah dan bisa diukur.",
    detail: "Kami membantu menentukan target pasar, membuat pesan promosi, memilih kanal, lalu mengukur pelanggan dan penjualan yang dihasilkan.",
    outcome: "Promosi tidak lagi berjalan tanpa arah. Anda tahu siapa targetnya, apa yang ditawarkan, dan hasilnya.",
    items: ["Target pasar dan pesan promosi", "Konten, iklan, dan kerja sama KOL", "Laporan pelanggan dan penjualan"],
    icon: BarChart3,
    tone: "sand",
    packages: [
      { slug: "rencana-marketing", aliases: ["program-member-dasar"], name: "Rencana marketing", price: "Rp8 juta", note: "satu kali pekerjaan", items: ["Cek brand dan target pasar", "Rencana promosi 30 hari", "Prioritas kanal dan anggaran"] },
      { slug: "kampanye-akuisisi", aliases: ["kampanye-pelanggan-kembali"], name: "Kampanye akuisisi pelanggan", price: "Rp15 juta", note: "mulai dari", items: ["Konsep dan pesan kampanye", "Konten, iklan, atau kerja sama KOL", "Laporan pelanggan dan penjualan"] },
      { slug: "pengelolaan-marketing", aliases: ["pengelolaan-member-bulanan"], name: "Pengelolaan marketing bulanan", price: "Rp12 juta", note: "per bulan", items: ["Rencana marketing bulanan", "Pelaksanaan dan perbaikan promosi", "Laporan hasil marketing"] },
    ],
  },
];

type PackageDetail = {
  packageSlug: string;
  promise: string;
  audience: string;
  problem: string;
  duration: string;
  steps: { title: string; text: string }[];
  deliverables: string[];
  metrics: string[];
};

const packageDetails: PackageDetail[] = [
  {
    packageSlug: "audit-operasional-outlet",
    promise: "Temukan masalah outlet sebelum masalah itu menghabiskan biaya.",
    audience: "Untuk pemilik cafe atau resto yang ingin tahu apa yang harus diperbaiki lebih dulu.",
    problem: "SOP tidak seragam, stok sulit dikontrol, dan biaya kecil terus bocor tanpa terlihat.",
    duration: "1–2 minggu",
    steps: [
      { title: "Cek cara kerja outlet", text: "Kami melihat alur buka shift, kerja tim, transaksi, stok, dan tutup kas." },
      { title: "Cari sumber masalah", text: "Kami membandingkan kondisi lapangan dengan data penjualan, stok, HPP, dan biaya." },
      { title: "Susun prioritas", text: "Kami memisahkan masalah yang harus diperbaiki segera dari yang bisa dikerjakan kemudian." },
      { title: "Serahkan laporan", text: "Anda mendapat temuan, dampak masalah, dan langkah perbaikan yang jelas." },
    ],
    deliverables: ["Cek alur kerja outlet", "Daftar masalah utama", "Prioritas perbaikan", "Laporan dan rekomendasi"],
    metrics: ["Masalah yang ditemukan", "Prioritas perbaikan", "Potensi kebocoran yang dicek"],
  },
  {
    packageSlug: "sistem-kontrol-outlet",
    promise: "Buat cara kerja outlet lebih rapi dan mudah diawasi.",
    audience: "Untuk bisnis yang sudah tahu masalahnya dan ingin membangun sistem kerja yang konsisten.",
    problem: "Setiap orang bekerja dengan cara berbeda. Stok, kas, dan laporan sulit dicek dari pusat.",
    duration: "3–5 minggu",
    steps: [
      { title: "Tentukan standar kerja", text: "Kami menyepakati cara kerja kasir, shift, stok, tutup kas, dan pelaporan." },
      { title: "Buat SOP yang singkat", text: "Kami menulis panduan yang bisa dipakai tim, bukan dokumen panjang yang tidak dibaca." },
      { title: "Pasang kontrol dasar", text: "Kami membantu menata pencatatan stok, HPP, kas, dan laporan operasional." },
      { title: "Uji bersama tim", text: "Kami mencoba sistem di outlet, memperbaiki bagian yang sulit, lalu menyerahkannya untuk dipakai." },
    ],
    deliverables: ["SOP kerja outlet", "Alur kas dan tutup shift", "Kontrol stok dan HPP", "Laporan operasional dasar"],
    metrics: ["SOP yang dipakai tim", "Laporan yang masuk rutin", "Data stok dan biaya yang tercatat"],
  },
  {
    packageSlug: "pendampingan-operasional",
    promise: "Pastikan sistem outlet benar-benar berjalan setiap minggu.",
    audience: "Untuk pemilik yang sudah punya SOP, tetapi ingin ada partner untuk mengecek dan memperbaikinya.",
    problem: "SOP sudah dibuat, tetapi tidak selalu dijalankan. Masalah yang sama muncul berulang kali.",
    duration: "Berjalan per bulan",
    steps: [
      { title: "Cek laporan mingguan", text: "Kami melihat penjualan, stok, biaya, kas, dan masalah yang muncul di outlet." },
      { title: "Bahas dengan supervisor", text: "Kami mencari penyebab masalah dan menentukan tindakan yang bisa dilakukan tim." },
      { title: "Pantau perbaikan", text: "Kami mengecek apakah tindakan sudah dijalankan dan memberi koreksi bila diperlukan." },
      { title: "Buat laporan bulanan", text: "Anda menerima ringkasan kondisi outlet dan prioritas perbaikan berikutnya." },
    ],
    deliverables: ["Review laporan mingguan", "Pendampingan supervisor", "Catatan perbaikan outlet", "Laporan kondisi bulanan"],
    metrics: ["Masalah yang selesai", "Kepatuhan SOP", "Kondisi stok dan biaya"],
  },
  {
    packageSlug: "fitur-digital-sesuai-kebutuhan",
    promise: "Selesaikan satu kebutuhan digital yang paling penting untuk bisnis Anda.",
    audience: "Untuk bisnis F&B yang ingin membangun satu fitur atau satu sistem fokus tanpa mengambil paket lengkap.",
    problem: "Ada satu proses penting yang masih manual, belum rapi, atau belum tersedia untuk pelanggan dan tim.",
    duration: "Menyesuaikan fokus fitur",
    steps: [
      { title: "Tentukan satu fokus", text: "Kami menyepakati satu fitur atau satu sistem utama yang paling berguna untuk bisnis Anda." },
      { title: "Susun alur kerja", text: "Kami memetakan kebutuhan pengguna, informasi, dan alur kerja yang harus berjalan." },
      { title: "Bangun fitur", text: "Kami mengerjakan fokus yang disepakati sampai bisa digunakan sesuai kebutuhan bisnis." },
      { title: "Uji dan serahkan", text: "Kami mengecek alur utama bersama Anda lalu menyerahkan fitur yang siap dipakai." },
    ],
    deliverables: ["Satu fitur atau sistem fokus", "Alur kerja utama", "Tampilan yang siap digunakan", "Serah-terima dan panduan dasar"],
    metrics: ["Fokus fitur yang selesai", "Alur utama yang berjalan", "Kesiapan penggunaan oleh tim atau pelanggan"],
  },
  {
    packageSlug: "sistem-pesan-dan-bayar",
    promise: "Buat pelanggan bisa pesan dan bayar tanpa proses yang berbelit.",
    audience: "Untuk bisnis yang ingin menerima pesanan online dengan alur yang lebih rapi.",
    problem: "Pesanan masuk dari banyak tempat, mudah salah catat, dan pelanggan tidak tahu status pesanannya.",
    duration: "4–8 minggu",
    steps: [
      { title: "Petakan alur pesanan", text: "Kami menyusun alur dari pilih menu, keranjang, pembayaran, sampai pesanan selesai." },
      { title: "Buat menu dan keranjang", text: "Pelanggan bisa melihat menu, memilih pesanan, dan mengirim order dengan jelas." },
      { title: "Hubungkan pembayaran", text: "Kami menyiapkan metode pembayaran dan status pesanan yang mudah dipantau." },
      { title: "Uji bersama outlet", text: "Kami mencoba alur dengan tim agar pesanan tidak berhenti di tengah jalan." },
    ],
    deliverables: ["Menu dan keranjang pesanan", "Alur pembayaran", "Status pesanan", "Riwayat pesanan pelanggan"],
    metrics: ["Pesanan masuk", "Pesanan berhasil dibayar", "Pesanan yang selesai tanpa koreksi manual"],
  },
  {
    packageSlug: "sistem-bisnis-terintegrasi",
    promise: "Buat pesanan pelanggan masuk ke tim dan laporan tanpa dicatat ulang.",
    audience: "Untuk bisnis yang sudah punya kasir atau pesanan online, tetapi datanya belum terhubung.",
    problem: "Tim menyalin pesanan secara manual. Pemilik sulit melihat penjualan dari semua kanal.",
    duration: "3–6 minggu",
    steps: [
      { title: "Cek sistem yang ada", text: "Kami melihat kasir, pesanan online, pembayaran, dan laporan yang sedang digunakan." },
      { title: "Tentukan data yang terhubung", text: "Kami memilih data penting seperti menu, pesanan, pembayaran, dan penjualan." },
      { title: "Hubungkan alur kerja", text: "Kami membuat pesanan masuk ke tempat yang tepat untuk kasir dan tim outlet." },
      { title: "Uji laporan", text: "Kami mencocokkan pesanan dan penjualan agar pemilik mendapat laporan yang bisa dipercaya." },
    ],
    deliverables: ["Alur pesanan ke kasir", "Akses untuk tim", "Laporan penjualan dasar", "Panduan penggunaan"],
    metrics: ["Pesanan yang masuk otomatis", "Waktu pencatatan", "Kesesuaian laporan penjualan"],
  },
  {
    packageSlug: "rencana-marketing",
    promise: "Tahu harus promosi ke siapa, dengan pesan apa, dan lewat kanal mana.",
    audience: "Untuk cafe atau resto yang ingin mulai marketing dengan arah yang jelas.",
    problem: "Promosi sering dibuat tanpa target. Konten berjalan, tetapi tidak jelas siapa yang dituju dan apa hasilnya.",
    duration: "1–2 minggu",
    steps: [
      { title: "Cek kondisi brand", text: "Kami melihat produk, harga, lokasi, pelanggan, dan cara brand Anda tampil saat ini." },
      { title: "Tentukan target pasar", text: "Kami memilih pelanggan utama yang paling masuk akal untuk dikejar lebih dulu." },
      { title: "Susun rencana promosi", text: "Kami membuat pesan, ide konten, kanal, dan rencana promosi untuk 30 hari." },
      { title: "Tentukan prioritas", text: "Anda mendapat urutan pekerjaan dan perkiraan anggaran sebelum mulai berpromosi." },
    ],
    deliverables: ["Ringkasan kondisi brand", "Target pelanggan utama", "Rencana marketing 30 hari", "Prioritas kanal dan anggaran"],
    metrics: ["Target pelanggan jelas", "Rencana konten tersedia", "Prioritas biaya promosi"],
  },
  {
    packageSlug: "kampanye-akuisisi",
    promise: "Datangkan pelanggan baru melalui kampanye yang jelas target dan ukurannya.",
    audience: "Untuk cafe atau resto yang ingin menjalankan promosi untuk produk, outlet, atau pembukaan baru.",
    problem: "Promosi sudah mengeluarkan biaya, tetapi belum jelas berapa pelanggan dan penjualan yang dihasilkan.",
    duration: "4–6 minggu per kampanye",
    steps: [
      { title: "Tentukan tujuan kampanye", text: "Kami memilih satu tujuan: mengenalkan brand, mengisi outlet, meluncurkan menu, atau meningkatkan penjualan." },
      { title: "Buat konsep dan pesan", text: "Kami menyusun ide kampanye yang mudah dipahami dan sesuai dengan target pelanggan." },
      { title: "Jalankan di kanal yang tepat", text: "Kami mengatur konten, iklan, atau kerja sama KOL sesuai kebutuhan kampanye." },
      { title: "Lihat hasilnya", text: "Kami melaporkan jangkauan, respons, pelanggan, penjualan, dan biaya yang digunakan." },
    ],
    deliverables: ["Tujuan dan target kampanye", "Konsep dan materi promosi", "Pelaksanaan konten, iklan, atau KOL", "Laporan pelanggan dan penjualan"],
    metrics: ["Jangkauan kampanye", "Respons pelanggan", "Pelanggan baru", "Penjualan dari kampanye"],
  },
  {
    packageSlug: "pengelolaan-marketing",
    promise: "Jalankan marketing setiap bulan tanpa harus membangun tim baru.",
    audience: "Untuk cafe atau resto yang ingin marketing rutin, tetapi belum punya tim marketing internal.",
    problem: "Marketing berhenti di tengah jalan. Konten tidak rutin dan hasil promosi tidak pernah direview.",
    duration: "Berjalan per bulan",
    steps: [
      { title: "Tentukan target bulanan", text: "Kami memilih target utama, seperti pelanggan baru, penjualan menu, atau kunjungan outlet." },
      { title: "Buat rencana konten", text: "Kami menyusun tema, pesan, jadwal, dan kanal marketing untuk satu bulan." },
      { title: "Jalankan promosi", text: "Kami membantu menjalankan konten, iklan, atau kerja sama marketing yang disepakati." },
      { title: "Review dan perbaiki", text: "Kami melihat apa yang berhasil, menghentikan yang tidak efektif, dan menyusun langkah bulan berikutnya." },
    ],
    deliverables: ["Rencana marketing bulanan", "Konten dan materi promosi", "Pelaksanaan marketing yang disepakati", "Laporan hasil dan rencana berikutnya"],
    metrics: ["Konten yang berjalan", "Pelanggan baru", "Respons dan penjualan", "Biaya marketing"],
  },
];

const navItems = [
  ["Cara kami membantu", "#layanan"],
  ["Djiwa Tentram", "#proof"],
  ["Kontak", "#kontak"],
];

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="Yumme Group, ke beranda">
      <span className="brand-mark">Y</span>
      <span>Yumme <span className="brand-muted">Group</span></span>
    </a>
  );
}

function ArrowLink({ children, href = "#kontak", light = false }: { children: ReactNode; href?: string; light?: boolean }) {
  return (
    <a className={`arrow-link${light ? " arrow-link-light" : ""}`} href={href}>
      {children}
      <ArrowUpRight size={16} strokeWidth={1.8} />
    </a>
  );
}

function ServicePage({ offer }: { offer: Offer }) {
  const IconComponent = offer.icon;
  return (
    <div className="site service-page" id="top">
      <header className="site-header">
        <div className="container nav-wrap">
          <Logo />
          <a className="nav-cta" href="/#kontak">Bahas bisnis Anda <ArrowUpRight size={15} /></a>
        </div>
      </header>
      <main>
        <section className={`service-hero ${offer.tone}`}>
          <div className="container service-hero-grid">
            <div>
              <a className="back-link" href="/#layanan"><ChevronRight size={16} className="back-link-icon" /> Semua layanan</a>
              <div className="service-identity"><span className="service-icon"><IconComponent size={25} /></span><span>LAYANAN {offer.number}</span></div>
              <h1>{offer.title}</h1>
              <p>{offer.detail}</p>
              <a className="button button-primary" href="/#kontak">Diskusikan kebutuhan Anda <ArrowUpRight size={17} /></a>
            </div>
            <div className="service-outcome"><span className="eyebrow">HASIL YANG ANDA DAPATKAN</span><strong>{offer.outcome}</strong><div className="service-outcome-list">{offer.items.map((item) => <span key={item}><Check size={16} />{item}</span>)}</div></div>
          </div>
        </section>
        <section className="section-pad pricing-section">
          <div className="container">
            <div className="section-heading"><div><span className="eyebrow">{offer.slug === "it" ? "PILIH FOKUS SISTEMNYA" : "PILIH PAKETNYA"}</span><h2>{offer.slug === "it" ? "Mulai dari satu kebutuhan yang paling penting." : "Pilih bantuan yang paling Anda butuhkan."}</h2></div><p>{offer.slug === "it" ? "Bagian 01 tersedia sebagai satu fitur atau satu fokus sistem dengan harga Rp5 juta untuk satu kali pekerjaan." : "Harga di bawah adalah harga mulai. Harga final menyesuaikan ukuran bisnis, jumlah outlet, dan kebutuhan Anda."}</p></div>
            <div className="pricing-grid">{offer.packages.map((pkg, index) => <article className={`pricing-card${index === 1 ? " pricing-card-featured" : ""}`} key={pkg.name}><div className="pricing-card-top"><span>0{index + 1}</span><span>{pkg.note}</span></div><h3>{pkg.name}</h3><strong>{pkg.price}</strong><ul>{pkg.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul><a className="pricing-link" href={`/layanan/${offer.slug}/${pkg.slug}`}>{offer.slug === "it" ? "Bahas fitur ini" : "Bahas paket ini"} <ArrowUpRight size={15} /></a></article>)}</div>
            <p className="pricing-note">* Untuk bagian 01, Rp5 juta berlaku untuk satu fitur atau satu fokus sistem dalam satu kali pekerjaan. Biaya domain, hosting, layanan pihak ketiga, dan pekerjaan tambahan di luar scope disepakati terpisah.</p>
          </div>
        </section>
        <section className="service-process section-pad"><div className="container process-grid"><div><span className="eyebrow">CARA KERJA</span><h2>Kita mulai dari masalah yang paling penting.</h2></div><div className="process-steps"><div><b>01</b><span><strong>Ceritakan</strong><small>Anda menjelaskan kondisi bisnis dan masalah yang sedang dihadapi.</small></span></div><div><b>02</b><span><strong>Susun solusi</strong><small>Kami memilih pekerjaan yang paling penting dan sesuai anggaran.</small></span></div><div><b>03</b><span><strong>Kerjakan bersama</strong><small>Kami membantu menjalankan solusi sampai bisa dipakai tim.</small></span></div></div></div></section>
        <section className="service-cta"><div className="container"><span className="eyebrow eyebrow-light">LANGKAH BERIKUTNYA</span><h2>Belum tahu harus mulai dari mana?</h2><p>Ceritakan kondisi bisnis Anda. Kami bantu memilih pekerjaan pertama yang paling berguna.</p><a className="button button-light" href="/#kontak">Ceritakan bisnis Anda <ArrowUpRight size={17} /></a></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group</span><a href="/">Kembali ke djiwatentram.web.id</a></div></footer>
    </div>
  );
}

function PackagePage({ offer, pkg, detail }: { offer: Offer; pkg: Package; detail: PackageDetail }) {
  return (
    <div className="site package-page" id="top">
      <header className="site-header"><div className="container nav-wrap"><Logo /><a className="nav-cta" href="/#kontak">Bahas bisnis Anda <ArrowUpRight size={15} /></a></div></header>
      <main>
        <section className={`package-hero ${offer.tone}`}>
          <div className="container package-hero-grid">
            <div><a className="back-link" href={`/layanan/${offer.slug}`}><ChevronRight size={16} className="back-link-icon" /> Kembali ke layanan</a><span className="package-label">{offer.slug === "it" ? "FITUR" : "PAKET"} {pkg.price.toUpperCase()} · {pkg.note.toUpperCase()}</span><h1>{pkg.name}</h1><p className="package-promise">{detail.promise}</p><a className="button button-primary" href="/#kontak">{offer.slug === "it" ? "Bahas fitur ini" : "Bahas paket ini"} <ArrowUpRight size={17} /></a></div>
            <div className="package-price-card"><span>INVESTASI</span><strong>{pkg.price}</strong><small>{pkg.note}. Harga final mengikuti ukuran bisnis dan kebutuhan implementasi.</small><div><Check size={16} /> Durasi awal: {detail.duration}</div></div>
          </div>
        </section>
        <section className="section-pad package-overview"><div className="container package-overview-grid"><div><span className="eyebrow">UNTUK SIAPA</span><h2>{detail.audience}</h2></div><div className="package-problem"><span className="eyebrow">MASALAH YANG KAMI SELESAIKAN</span><p>{detail.problem}</p></div></div></section>
        <section className="section-pad package-steps"><div className="container"><div className="section-heading"><div><span className="eyebrow">CARA KERJA KAMI</span><h2>Mulai dari masalah, jalankan solusinya, lalu ukur hasilnya.</h2></div><p>Kami mulai dari data dan masalah bisnis Anda. Setelah itu, kami jalankan program dan membaca hasilnya.</p></div><div className="package-step-grid">{detail.steps.map((step, index) => <article className="package-step" key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></div></section>
        <section className="section-pad package-results"><div className="container package-results-grid"><div><span className="eyebrow">YANG ANDA TERIMA</span><h2>Dapatkan pekerjaan yang jelas dan hasil yang bisa dicek.</h2><ul className="package-deliverables">{detail.deliverables.map((item) => <li key={item}><Check size={17} />{item}</li>)}</ul></div><div className="package-metrics"><span className="eyebrow">HASIL YANG KAMI UKUR</span>{detail.metrics.map((metric) => <div key={metric}><strong><Check size={17} /></strong><span>{metric}</span></div>)}</div></div></section>
        <section className="service-cta package-final-cta"><div className="container"><span className="eyebrow eyebrow-light">LANGKAH BERIKUTNYA</span><h2>Siap melihat apakah paket ini cocok untuk bisnis Anda?</h2><p>Ceritakan kondisi outlet dan target Anda. Kami bantu memilih paket yang paling masuk akal.</p><a className="button button-light" href="/#kontak">Bahas paket ini <ArrowUpRight size={17} /></a></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group</span><a href={`/layanan/${offer.slug}`}>Kembali ke layanan</a></div></footer>
    </div>
  );
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="site" id="top">
      <header className="site-header">
        <div className="container nav-wrap">
          <Logo />
          <nav className="desktop-nav" aria-label="Navigasi utama">
            {navItems.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="nav-actions">
            <a className="nav-cta" href="#kontak">Bahas bisnis Anda <ArrowUpRight size={15} /></a>
            <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Buka menu" aria-expanded={menuOpen} aria-controls="mobile-menu">
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu navigasi" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-menu-head"><Logo /><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu"><X size={22} /></button></div>
            <nav>{navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ChevronRight size={18} /></a>)}</nav>
            <a className="button button-primary menu-cta" href="#kontak" onClick={() => setMenuOpen(false)}>Bahas bisnis Anda <ArrowUpRight size={16} /></a>
          </aside>
        </div>
      )}

      <main>
        <section className="hero section-pad">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow eyebrow-dot"><span className="status-dot" /> Partner untuk bisnis F&B</span>
              <h1>Bisnis F&B yang lebih <em>rapi, kuat,</em> dan siap tumbuh.</h1>
              <p className="hero-lede">Yumme Group membantu pemilik cafe, resto, dan coffeeshop membangun sistem IT yang berguna dan marketing yang mendatangkan pelanggan.</p>
              <div className="hero-actions">
                <a className="button button-primary" href="#kontak">Bahas bisnis Anda <ArrowUpRight size={17} /></a>
                <a className="button button-secondary" href="#layanan">Lihat cara kami membantu <ChevronRight size={17} /></a>
              </div>
              <p className="hero-trust"><Check size={16} /> Berangkat dari pengalaman mengelola bisnis F&B sendiri.</p>
            </div>
            <div className="hero-card" aria-label="Ringkasan layanan Yumme Group">
              <div className="hero-card-top"><span>YUMME GROUP</span><span className="hero-card-dot" /></div>
              <div className="hero-card-copy"><span className="hero-card-kicker">Satu partner untuk membuat bisnis lebih teratur.</span><strong>Kami bantu outlet, tim, dan pelanggan bekerja lebih baik.</strong></div>
              <div className="hero-card-lines"><span><Store size={17} /> Outlet</span><span><Users size={17} /> Tim</span><span><Handshake size={17} /> Pelanggan</span></div>
              <div className="hero-card-footer"><span>Dibangun dari pengalaman nyata</span><span>01 / 03</span></div>
            </div>
          </div>
        </section>

        <section className="proof-highlight" id="proof">
          <div className="container proof-highlight-inner">
            <div className="proof-highlight-intro">
              <div className="proof-highlight-brand"><span className="proof-highlight-mark"><b>D</b><i>T</i></span><span><strong>Djiwa Tentram</strong><small>Brand cafe & resto Yumme Group</small></span></div>
              <div className="proof-highlight-copy"><span className="eyebrow">CONTOH YANG SUDAH BERJALAN</span><p>Kami membangun dan menjalankan Djiwa Tentram sendiri — dari outlet, tim, sistem pelanggan, sampai promosi. Inilah contoh nyata cara kerja Yumme.</p></div>
            </div>
            <div className="proof-metrics" aria-label="Snapshot data operasional dan akuisisi pelanggan Djiwa Tentram">
              <div><strong>46</strong><span>menu aktif</span></div>
              <div><strong>14</strong><span>kategori menu</span></div>
              <div><strong>16</strong><span>tim aktif</span></div>
              <div><strong>4.460</strong><span>transaksi paid/selesai</span></div>
              <div><strong>226</strong><span>profil pelanggan</span></div>
              <div><strong>143</strong><span>pelanggan dengan transaksi</span></div>
            </div>
            <div className="proof-highlight-foot"><span>Snapshot data operasional · 17 September 2026</span><span>Angka dapat berubah mengikuti aktivitas bisnis.</span></div>
          </div>
        </section>

        <section className="section-pad services-section" id="layanan">
          <div className="container">
            <div className="section-heading compact-heading">
              <div><span className="eyebrow">LAYANAN KAMI</span><h2>Pilih masalah yang ingin Anda selesaikan.</h2></div>
              <p>Anda tidak harus mengambil semuanya. Kita mulai dari hal yang paling mengganggu bisnis saat ini.</p>
            </div>
            <div className="offer-grid">
              {offers.map(({ number, title, text, items, icon: IconComponent, tone }) => (
                <a className={`offer-card ${tone}`} href={`/layanan/${offers.find((offer) => offer.title === title)?.slug ?? ""}`}>
                  <div className="offer-card-top"><span className="offer-icon"><IconComponent size={21} strokeWidth={1.8} /></span><span className="offer-number">{number}</span></div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <ul>{items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
                  <span className="offer-card-link">Lihat cakupan & harga <ArrowUpRight size={15} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="contact-section section-pad" id="kontak">
          <div className="container contact-grid">
            <div className="contact-copy"><span className="eyebrow eyebrow-light">MARI BICARA</span><h2>Ceritakan bisnis yang sedang Anda bangun.</h2><p>Isi singkat saja. Kami akan mulai dari memahami kondisi Anda, bukan langsung menawarkan paket.</p><div className="contact-note"><span />Diskusi pertama selalu dimulai dari mendengar.</div></div>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="form-row"><label>Nama<input name="name" required placeholder="Nama Anda" /></label><label>Nama bisnis<input name="business" required placeholder="Nama bisnis" /></label></div>
              <label>Email / WhatsApp<input name="contact" required placeholder="email atau nomor WhatsApp" /></label>
              <label>Yang ingin dibantu<select name="need" defaultValue=""><option value="" disabled>Pilih salah satu</option><option>Sistem IT untuk bisnis F&B</option><option>Marketing dan akuisisi pelanggan</option><option>Belum yakin, ingin konsultasi</option></select></label>
              <label>Ceritakan singkat<textarea name="message" rows={3} placeholder="Apa yang sedang ingin dirapikan atau dikembangkan?"></textarea></label>
              {submitted && <div className="form-honesty" role="status"><Check size={17} /> Terima kasih. Formulir Anda sudah diterima di halaman ini, tetapi belum dikirim ke server.</div>}
              <button className="button button-light" type="submit">Kirim formulir <ArrowUpRight size={17} /></button>
              <p className="form-note">Form ini masih presentasi awal. Belum ada data yang dikirim atau disimpan.</p>
            </form>
          </div>
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><div><Logo /><p>Partner untuk bisnis F&B yang ingin berjalan lebih baik.</p></div><div className="footer-links"><a href="#layanan">Cara kami membantu</a><a href="#proof">Djiwa Tentram</a><a href="#kontak">Bahas bisnis Anda</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group</span><span>Dibuat dari pengalaman menjalankan bisnis F&B.</span></div></footer>
    </div>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  const offer = offers.find((item) => path === `/layanan/${item.slug}` || segments[0] === "layanan" && (segments[1] === item.slug || item.aliases?.includes(segments[1])));
  const pkg = offer?.packages.find((item) => item.slug === segments[2] || item.aliases?.includes(segments[2]));
  const detail = pkg ? packageDetails.find((item) => item.packageSlug === pkg.slug) : undefined;
  return offer && pkg && detail ? <PackagePage offer={offer} pkg={pkg} detail={detail} /> : offer ? <ServicePage offer={offer} /> : <LandingPage />;
}

export default App;
