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
    title: "Rapikan operasional outlet",
    text: "Kami bantu membuat pekerjaan harian outlet lebih teratur dan mudah diawasi.",
    detail: "Kami melihat cara kerja outlet Anda, lalu membantu membuat aturan kerja, jadwal, dan checklist yang bisa dipakai setiap hari.",
    outcome: "Setiap orang tahu tugasnya. Pekerjaan tidak lagi bergantung pada satu orang.",
    items: ["Aturan kerja outlet", "SOP dan pelatihan", "Jadwal, absensi, dan evaluasi"],
    icon: Settings2,
    tone: "blue",
    packages: [
      { name: "Rapikan dasar", price: "Rp7,5 juta", note: "satu kali pekerjaan", items: ["Pengecekan cara kerja", "Daftar masalah utama", "3 SOP penting"] },
      { name: "Bangun cara kerja", price: "Rp18 juta", note: "satu kali pekerjaan", items: ["10 SOP utama", "Pelatihan tim", "Template jadwal dan checklist"] },
      { name: "Pendampingan outlet", price: "Rp12 juta", note: "per bulan", items: ["Pengecekan mingguan", "Pendampingan supervisor", "Perbaikan cara kerja"] },
    ],
  },
  {
    number: "02",
    slug: "sistem",
    title: "Bangun sistem bisnis",
    text: "Kami membuat website, aplikasi, atau dashboard yang benar-benar membantu pekerjaan Anda.",
    detail: "Kami mulai dari kebutuhan bisnis Anda, lalu membuat website, aplikasi, atau dashboard yang mudah dipakai oleh pelanggan dan tim.",
    outcome: "Data dan pekerjaan lebih mudah dikelola tanpa menambah kerumitan.",
    items: ["Website bisnis", "Aplikasi pelanggan", "Kasir dan dashboard"],
    icon: Code2,
    tone: "sage",
    packages: [
      { name: "Website bisnis", price: "Rp12 juta", note: "satu kali pekerjaan", items: ["Susunan halaman", "Tulisan dan desain", "Form kontak dan pengukuran"] },
      { name: "Aplikasi pelanggan", price: "Rp35 juta", note: "mulai dari", items: ["Alur pemesanan", "Login dan profil", "Menu, pesanan, dan status"] },
      { name: "Sistem kasir", price: "Rp20 juta", note: "mulai dari", items: ["Kasir atau dashboard", "Akses untuk setiap tim", "Laporan penjualan dasar"] },
    ],
  },
  {
    number: "03",
    slug: "akuisisi",
    title: "Dapatkan pelanggan baru",
    text: "Kami membantu brand Anda lebih dikenal dan mendatangkan pelanggan baru.",
    detail: "Kami merencanakan promosi, memilih media yang sesuai, dan melihat hasilnya supaya biaya promosi tidak berjalan tanpa arah.",
    outcome: "Anda tahu promosi mana yang menghasilkan perhatian, kunjungan, dan penjualan.",
    items: ["Promosi dan KOL", "Konten untuk pelanggan", "Pengukuran hasil penjualan"],
    icon: BarChart3,
    tone: "sand",
    packages: [
      { name: "Promosi awal", price: "Rp8 juta", note: "per promosi", items: ["Tujuan promosi", "Rencana konten", "Laporan hasil"] },
      { name: "Kerja sama KOL", price: "Rp15 juta", note: "mulai dari", items: ["Memilih KOL", "Brief dan koordinasi", "Laporan jangkauan dan hasil"] },
      { name: "Pendampingan promosi", price: "Rp12 juta", note: "per bulan", items: ["Rencana promosi bulanan", "Pemilihan media", "Pengecekan data dan percobaan baru"] },
    ],
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
            <div className="pricing-grid">{offer.packages.map((pkg, index) => <article className={`pricing-card${index === 1 ? " pricing-card-featured" : ""}`} key={pkg.name}><div className="pricing-card-top"><span>0{index + 1}</span><span>{pkg.note}</span></div><h3>{pkg.name}</h3><strong>{pkg.price}</strong><ul>{pkg.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul><a className="pricing-link" href="/#kontak">Bahas paket ini <ArrowUpRight size={15} /></a></article>)}</div>
            <p className="pricing-note">* Harga belum termasuk iklan, biaya KOL, domain, hosting, biaya pembayaran online, atau sambungan ke layanan lain. Harga final ditentukan setelah kebutuhan disepakati.</p>
          </div>
        </section>
        <section className="service-process section-pad"><div className="container process-grid"><div><span className="eyebrow">CARA KERJA</span><h2>Kita mulai dari masalah yang paling penting.</h2></div><div className="process-steps"><div><b>01</b><span><strong>Ceritakan</strong><small>Anda menjelaskan kondisi bisnis dan masalah yang sedang dihadapi.</small></span></div><div><b>02</b><span><strong>Susun solusi</strong><small>Kami memilih pekerjaan yang paling penting dan sesuai anggaran.</small></span></div><div><b>03</b><span><strong>Kerjakan bersama</strong><small>Kami membantu menjalankan solusi sampai bisa dipakai team.</small></span></div></div></div></section>
        <section className="service-cta"><div className="container"><span className="eyebrow eyebrow-light">LANGKAH BERIKUTNYA</span><h2>Belum tahu harus mulai dari mana?</h2><p>Ceritakan kondisi bisnis Anda. Kami bantu memilih pekerjaan pertama yang paling berguna.</p><a className="button button-light" href="/#kontak">Ceritakan bisnis Anda <ArrowUpRight size={17} /></a></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group</span><a href="/">Kembali ke yumme.id</a></div></footer>
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
              <label>Yang ingin dibantu<select name="need" defaultValue=""><option value="" disabled>Pilih salah satu</option><option>Operasional outlet</option><option>Website atau aplikasi</option><option>SDM dan SOP</option><option>Promosi dan kerja sama KOL</option><option>Belum yakin, ingin konsultasi</option></select></label>
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
  const offer = offers.find((item) => path === `/layanan/${item.slug}`);
  return offer ? <ServicePage offer={offer} /> : <LandingPage />;
}

export default App;
