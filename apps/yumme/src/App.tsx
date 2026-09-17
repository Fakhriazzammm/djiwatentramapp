import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Code2,
  Handshake,
  Menu,
  Settings2,
  Store,
  Users,
  X,
} from "lucide-react";

type Icon = typeof Store;

type Package = {
  slug: string;
  name: string;
  price: string;
  note: string;
  items: string[];
};

type Offer = {
  number: string;
  slug: string;
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
    slug: "operasional",
    title: "Operasional outlet dan kontrol keuangan",
    text: "Rapikan kasir, stok, biaya, dan laporan agar kebocoran lebih cepat terlihat.",
    detail: "Kami membenahi alur buka shift, transaksi, stok bahan, pengeluaran, dan tutup kas agar pemilik tidak lagi menunggu rekap manual.",
    outcome: "Anda tahu penjualan, stok, biaya, dan hasil outlet dengan data yang lebih jelas.",
    items: ["Kasir, shift, dan tutup kas", "Stok bahan dan HPP", "Laporan penjualan dan biaya"],
    icon: Settings2,
    tone: "blue",
    packages: [
      { slug: "audit-operasional-outlet", name: "Audit operasional outlet", price: "Rp7,5 juta", note: "satu kali pekerjaan", items: ["Cek kasir, shift, dan tutup kas", "Cek stok, HPP, dan pengeluaran", "Daftar masalah dan prioritas perbaikan"] },
      { slug: "sistem-kasir-stok-hpp", name: "Sistem kasir, stok, dan HPP", price: "Rp18 juta", note: "satu kali pekerjaan", items: ["SOP kasir dan tutup kas", "Pencatatan stok dan HPP", "Laporan penjualan dasar"] },
      { slug: "pendampingan-kontrol-outlet", name: "Pendampingan kontrol outlet", price: "Rp12 juta", note: "per bulan", items: ["Pengecekan laporan mingguan", "Pendampingan supervisor", "Tindak lanjut masalah operasional"] },
    ],
  },
  {
    number: "02",
    slug: "sistem",
    title: "Sistem kasir dan pemesanan pelanggan",
    text: "Permudah pelanggan melihat menu, memesan, dan membayar—dengan data yang masuk ke tim.",
    detail: "Kami membuat menu online, alur pemesanan, pembayaran, dan dashboard yang terhubung dengan pekerjaan di outlet.",
    outcome: "Pelanggan lebih mudah memesan. Tim tidak perlu memindahkan data pesanan secara manual.",
    items: ["Menu dan pemesanan online", "Pembayaran dan status pesanan", "Kasir dan dashboard terhubung"],
    icon: Code2,
    tone: "sage",
    packages: [
      { slug: "menu-online-dan-website", name: "Menu online dan website", price: "Rp12 juta", note: "satu kali pekerjaan", items: ["Menu dan informasi usaha", "Tulisan dan desain", "Form pemesanan atau kontak"] },
      { slug: "sistem-pesan-dan-bayar", name: "Sistem pesan dan bayar", price: "Rp35 juta", note: "mulai dari", items: ["Menu dan keranjang", "Pembayaran dan status pesanan", "Riwayat pesanan pelanggan"] },
      { slug: "integrasi-kasir-dan-dashboard", name: "Integrasi kasir dan dashboard", price: "Rp20 juta", note: "mulai dari", items: ["Kasir dan pencatatan transaksi", "Akses untuk setiap tim", "Laporan penjualan dasar"] },
    ],
  },
  {
    number: "03",
    slug: "akuisisi",
    title: "Member dan pelanggan kembali",
    text: "Ubah transaksi pertama menjadi kunjungan ulang dengan member, penawaran, dan laporan yang jelas.",
    detail: "Kami membantu membuat program member, penawaran, dan komunikasi yang mendorong pelanggan datang kembali berdasarkan data transaksi.",
    outcome: "Anda tahu siapa pelanggan Anda, penawaran mana yang dipakai, dan berapa banyak pelanggan yang kembali.",
    items: ["Program member dan hadiah", "Penawaran untuk pelanggan lama", "Laporan pelanggan kembali"],
    icon: BarChart3,
    tone: "sand",
    packages: [
      { slug: "program-member-dasar", name: "Program member dasar", price: "Rp8 juta", note: "satu kali pekerjaan", items: ["Aturan dan manfaat member", "Penawaran untuk pelanggan", "Laporan hasil awal"] },
      { slug: "kampanye-pelanggan-kembali", name: "Kampanye pelanggan kembali", price: "Rp15 juta", note: "mulai dari", items: ["Rencana penawaran", "Konten dan kerja sama KOL", "Laporan pemakaian dan penjualan"] },
      { slug: "pengelolaan-member-bulanan", name: "Pengelolaan member bulanan", price: "Rp12 juta", note: "per bulan", items: ["Rencana komunikasi bulanan", "Perbaikan program member", "Pengecekan pelanggan yang kembali"] },
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
    packageSlug: "program-member-dasar",
    promise: "Buat pelanggan mau kembali, bukan hanya datang sekali.",
    audience: "Untuk cafe atau resto yang belum punya program member.",
    problem: "Pelanggan datang sekali lalu hilang. Data pelanggan belum dipakai untuk mengajak mereka kembali.",
    duration: "2–3 minggu",
    steps: [
      { title: "Cek transaksi", text: "Kami melihat menu, nilai transaksi, jam ramai, dan data pelanggan yang sudah ada." },
      { title: "Buat aturan member", text: "Kami menentukan cara daftar, manfaat, dan aturan yang mudah dipahami kasir dan pelanggan." },
      { title: "Buat penawaran pertama", text: "Kami menyiapkan penawaran untuk mendorong pelanggan datang kembali." },
      { title: "Jalankan dan cek hasil", text: "Tim menjalankan program. Kami melihat member baru, pemakaian penawaran, dan pelanggan yang kembali." },
    ],
    deliverables: ["Aturan program member", "Penawaran untuk pelanggan", "Panduan singkat untuk tim", "Laporan hasil awal"],
    metrics: ["Member baru", "Penawaran terpakai", "Pelanggan yang kembali"],
  },
  {
    packageSlug: "kampanye-pelanggan-kembali",
    promise: "Arahkan promosi ke pelanggan yang paling mungkin kembali.",
    audience: "Untuk bisnis yang sudah punya data pelanggan dan ingin membuat promosi yang lebih tepat.",
    problem: "Promosi dikirim ke semua orang. Biaya keluar, tetapi hasilnya tidak jelas.",
    duration: "4–6 minggu per kampanye",
    steps: [
      { title: "Tentukan target", text: "Kami memilih satu tujuan: mengajak pelanggan lama kembali, mengisi jam sepi, atau menjual menu tertentu." },
      { title: "Pilih pelanggan", text: "Kami memilih pelanggan berdasarkan riwayat transaksi, bukan mengirim promosi secara acak." },
      { title: "Buat promosi", text: "Kami menyiapkan penawaran, pesan, konten, dan KOL bila memang dibutuhkan." },
      { title: "Ukur hasil", text: "Kami melihat penawaran yang dipakai, kunjungan, penjualan, dan biaya promosi." },
    ],
    deliverables: ["Target kampanye", "Penawaran dan materi promosi", "Konten atau kerja sama KOL bila dibutuhkan", "Laporan kunjungan dan penjualan"],
    metrics: ["Pelanggan yang menerima promosi", "Penawaran terpakai", "Kunjungan dan penjualan"],
  },
  {
    packageSlug: "pengelolaan-member-bulanan",
    promise: "Jaga member tetap aktif dan terus kembali.",
    audience: "Untuk bisnis yang sudah punya program member, tetapi belum punya tim untuk mengelolanya setiap bulan.",
    problem: "Program member berhenti setelah diluncurkan. Penawaran berulang dan pelanggan yang kembali tidak terukur.",
    duration: "Berjalan per bulan",
    steps: [
      { title: "Tentukan target bulan ini", text: "Kami memilih satu target, seperti mengajak member lama kembali atau mengisi hari sepi." },
      { title: "Susun penawaran", text: "Kami membuat jadwal pesan dan penawaran sesuai kondisi bisnis dan kemampuan outlet." },
      { title: "Jalankan bersama tim", text: "Kami memberi arahan kepada tim dan mengecek apakah penawaran berjalan dengan benar." },
      { title: "Review hasil", text: "Kami melihat data, menghentikan yang tidak bekerja, dan melanjutkan yang menghasilkan kunjungan." },
    ],
    deliverables: ["Rencana member bulanan", "Penawaran dan materi komunikasi", "Review bersama tim", "Laporan pelanggan kembali"],
    metrics: ["Member aktif", "Frekuensi kunjungan", "Penjualan dari member", "Biaya promosi"],
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
            <div className="section-heading"><div><span className="eyebrow">PILIH PAKETNYA</span><h2>Pilih bantuan yang paling Anda butuhkan.</h2></div><p>Harga di bawah adalah harga mulai. Harga final menyesuaikan ukuran bisnis, jumlah outlet, dan kebutuhan Anda.</p></div>
            <div className="pricing-grid">{offer.packages.map((pkg, index) => <article className={`pricing-card${index === 1 ? " pricing-card-featured" : ""}`} key={pkg.name}><div className="pricing-card-top"><span>0{index + 1}</span><span>{pkg.note}</span></div><h3>{pkg.name}</h3><strong>{pkg.price}</strong><ul>{pkg.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul><a className="pricing-link" href={`/layanan/${offer.slug}/${pkg.slug}`}>Bahas paket ini <ArrowUpRight size={15} /></a></article>)}</div>
            <p className="pricing-note">* Harga belum termasuk iklan, biaya KOL, domain, hosting, biaya pembayaran online, atau sambungan ke layanan lain. Harga final ditentukan setelah kebutuhan disepakati.</p>
          </div>
        </section>
        <section className="service-process section-pad"><div className="container process-grid"><div><span className="eyebrow">CARA KERJA</span><h2>Kita mulai dari masalah yang paling penting.</h2></div><div className="process-steps"><div><b>01</b><span><strong>Ceritakan</strong><small>Anda menjelaskan kondisi bisnis dan masalah yang sedang dihadapi.</small></span></div><div><b>02</b><span><strong>Susun solusi</strong><small>Kami memilih pekerjaan yang paling penting dan sesuai anggaran.</small></span></div><div><b>03</b><span><strong>Kerjakan bersama</strong><small>Kami membantu menjalankan solusi sampai bisa dipakai tim.</small></span></div></div></div></section>
        <section className="service-cta"><div className="container"><span className="eyebrow eyebrow-light">LANGKAH BERIKUTNYA</span><h2>Belum tahu harus mulai dari mana?</h2><p>Ceritakan kondisi bisnis Anda. Kami bantu memilih pekerjaan pertama yang paling berguna.</p><a className="button button-light" href="/#kontak">Ceritakan bisnis Anda <ArrowUpRight size={17} /></a></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group</span><a href="/">Kembali ke yumme.id</a></div></footer>
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
            <div><a className="back-link" href={`/layanan/${offer.slug}`}><ChevronRight size={16} className="back-link-icon" /> Kembali ke layanan</a><span className="package-label">PAKET {pkg.price.toUpperCase()} · {pkg.note.toUpperCase()}</span><h1>{pkg.name}</h1><p className="package-promise">{detail.promise}</p><a className="button button-primary" href="/#kontak">Bahas paket ini <ArrowUpRight size={17} /></a></div>
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
              <p className="hero-lede">Yumme Group membantu pemilik cafe, resto, dan coffeeshop menata operasional, membuat sistem yang berguna, dan mendapatkan pelanggan baru.</p>
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
              <label>Yang ingin dibantu<select name="need" defaultValue=""><option value="" disabled>Pilih salah satu</option><option>Operasional outlet</option><option>Website atau aplikasi</option><option>SDM dan SOP</option><option>Program pelanggan dan promosi</option><option>Belum yakin, ingin konsultasi</option></select></label>
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
  const offer = offers.find((item) => path === `/layanan/${item.slug}` || segments[0] === "layanan" && segments[1] === item.slug);
  const pkg = offer?.packages.find((item) => item.slug === segments[2]);
  const detail = pkg ? packageDetails.find((item) => item.packageSlug === pkg.slug) : undefined;
  return offer && pkg && detail ? <PackagePage offer={offer} pkg={pkg} detail={detail} /> : offer ? <ServicePage offer={offer} /> : <LandingPage />;
}

export default App;
