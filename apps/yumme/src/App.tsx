import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Code2,
  Handshake,
  Menu,
  Network,
  PenTool,
  Quote,
  Settings2,
  Sparkles,
  Store,
  Users,
  X,
  Zap,
} from "lucide-react";

type Icon = typeof Store;

const pillars: { title: string; label: string; text: string; icon: Icon; tone: string }[] = [
  { title: "Operate", label: "OPERASIONAL", text: "Membuat operasional outlet lebih rapi, konsisten, dan terukur.", icon: Settings2, tone: "azure" },
  { title: "People", label: "PEOPLE", text: "Membantu team bekerja dengan SOP, jadwal, dan sistem HR yang jelas.", icon: Users, tone: "sage" },
  { title: "Technology", label: "TECHNOLOGY", text: "Menghubungkan POS, customer app, data, dan automation dalam satu alur.", icon: Code2, tone: "lavender" },
  { title: "Grow", label: "GROWTH", text: "Mengubah insight menjadi campaign, retention, dan pertumbuhan yang sehat.", icon: BarChart3, tone: "sand" },
];

const ecosystem = [
  ["Website & landing page", "Membangun kehadiran digital yang menjelaskan brand dan mengarahkan customer ke aksi yang tepat.", PenTool],
  ["Mobile & customer app", "Membuat pengalaman digital yang lebih dekat, praktis, dan relevan untuk customer.", Code2],
  ["POS & cashier operations", "Transaksi dan operasional kasir tetap terhubung dengan data outlet.", Store],
  ["Customer ordering app", "Pengalaman pemesanan yang lebih mudah untuk customer dan team.", Network],
  ["Inventory & purchasing", "Membantu menjaga ketersediaan bahan dan keputusan pembelian.", ClipboardCheck],
  ["Finance & reconciliation", "Membawa transaksi, pengeluaran, dan rekonsiliasi ke satu pandangan.", CircleDollarSign],
  ["HR, attendance & scheduling", "People operations yang lebih rapi dari onboarding sampai shift.", Users],
  ["Dashboard & automation", "Dashboard, notifikasi, dan alur kerja yang mengurangi pekerjaan berulang.", Zap],
] as const;

const navItems = [["Ecosystem", "#ecosystem"], ["Operations", "#operations"], ["Technology", "#technology"], ["Growth", "#growth"], ["Brands", "#brands"]];

function Logo() {
  return <a className="brand" href="#top" aria-label="Yumme Group, ke beranda"><span className="brand-mark">Y</span><span>Yumme<span className="brand-muted"> Group</span></span></a>;
}

function ArrowLink({ children, href = "#inquiry", light = false }: { children: ReactNode; href?: string; light?: boolean }) {
  return <a className={`arrow-link ${light ? "arrow-link-light" : ""}`} href={href}>{children}<ArrowUpRight size={16} strokeWidth={1.8} /></a>;
}

function SectionIntro({ eyebrow, title, text, align = "left" }: { eyebrow: string; title: string; text?: string; align?: "left" | "center" }) {
  return <div className={`section-intro ${align === "center" ? "centered" : ""}`}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return <div className="site" id="top">
    <header className="site-header">
      <div className="container nav-wrap"><Logo /><nav className="desktop-nav" aria-label="Navigasi utama">{navItems.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav><div className="nav-actions"><a className="nav-cta" href="#inquiry">Diskusikan Bisnis Anda <ArrowUpRight size={15} /></a><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Buka menu" aria-expanded={menuOpen} aria-controls="mobile-menu"><Menu size={22} /></button></div></div>
    </header>
    {menuOpen && <div className="mobile-menu-backdrop" onClick={closeMenu}><aside className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu navigasi" onClick={(e) => e.stopPropagation()}><div className="mobile-menu-head"><Logo /><button className="icon-button" onClick={closeMenu} aria-label="Tutup menu"><X size={22} /></button></div><nav>{navItems.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}<ChevronRight size={18} /></a>)}<a href="#about" onClick={closeMenu}>Tentang Yumme<ChevronRight size={18} /></a></nav><a className="button button-primary menu-cta" href="#inquiry" onClick={closeMenu}>Diskusikan Bisnis Anda <ArrowUpRight size={16} /></a></aside></div>}

    <main>
      <section className="hero section-pad"><div className="container hero-grid"><div className="hero-copy"><span className="eyebrow eyebrow-dot"><span className="status-dot" /> F&B operating group</span><h1>Bangun, kelola,<br /><em>dan kembangkan</em><br />bisnis F&B yang lebih baik.</h1><p className="hero-lede">Yumme Group menggabungkan pengalaman operasional F&B, teknologi, people management, dan growth marketing dalam satu ekosistem yang terhubung.</p><div className="hero-actions"><a className="button button-primary" href="#inquiry">Diskusikan Bisnis Anda <ArrowUpRight size={17} /></a><a className="button button-secondary" href="#ecosystem">Lihat Ekosistem Yumme <ChevronDown size={17} /></a></div><div className="hero-note"><span className="note-line" />Berangkat dari masalah nyata di lapangan.</div></div><HeroVisual /></div></section>

      <section className="operator-strip"><div className="container operator-grid"><div><span className="eyebrow">THE OPERATOR ADVANTAGE</span><h2>We don’t just build tools<br /><span>for F&B businesses.</span><br />We understand how to run them.</h2></div><div className="operator-body"><p>Pengalaman mengelola bisnis kuliner mengajarkan kami satu hal: sistem yang baik harus membantu orang di lapangan mengambil keputusan yang lebih baik, setiap hari.</p><div className="operator-list"><div><span>01</span><strong>Understand first</strong><small>Mulai dari realita operasional.</small></div><div><span>02</span><strong>Connect the dots</strong><small>Satukan team, outlet, dan data.</small></div><div><span>03</span><strong>Improve continuously</strong><small>Bangun sistem yang ikut bertumbuh.</small></div></div></div></div></section>

      <section className="section-pad" id="ecosystem"><div className="container"><SectionIntro eyebrow="THE YUMME ECOSYSTEM" title="One connected system.<br />Four ways to move forward." text="Bukan sekadar kumpulan tools. Kami membangun fondasi yang menghubungkan cara bisnis F&B berjalan, orang bekerja, dan customer kembali." /><div className="pillar-grid">{pillars.map(({ title, label, text, icon: IconComponent, tone }) => <article className={`pillar-card ${tone}`} key={title}><div className="card-top"><span className="icon-box"><IconComponent size={21} strokeWidth={1.7} /></span><span className="card-index">0{pillars.findIndex((p) => p.title === title) + 1}</span></div><div><span className="eyebrow">{label}</span><h3>{title}</h3><p>{text}</p></div><a className="circle-link" href={`#${title.toLowerCase()}`} aria-label={`Pelajari ${title}`}><ArrowUpRight size={18} /></a></article>)}</div></div></section>

      <section className="deep-section section-pad" id="technology"><div className="container technology-grid"><div><SectionIntro eyebrow="TECHNOLOGY AS AN ENABLER" title="The right system makes good work easier." text="Teknologi kami hadir untuk memperjelas pekerjaan, bukan menambah lapisan baru. Setiap bagian dirancang agar saling berbicara." /><ArrowLink href="#inquiry" light>Diskusikan kebutuhan sistem Anda</ArrowLink></div><div className="ecosystem-list">{ecosystem.map(([title, text, IconComponent], index) => <div className="ecosystem-item" key={title}><span className="number">0{index + 1}</span><span className="eco-icon"><IconComponent size={19} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>

      <section className="section-pad" id="operations"><div className="container split-feature"><div className="feature-visual people-visual"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="people-center"><Users size={28} /><span>PEOPLE<br /><strong>IN MOTION</strong></span></div><span className="float-label label-one">SOP & training <Check size={14} /></span><span className="float-label label-two">Shift clarity <Check size={14} /></span><span className="float-label label-three">Team growth <Check size={14} /></span></div><div className="feature-copy"><SectionIntro eyebrow="PEOPLE & OPERATIONS" title="Healthy operations start with a team that knows what good looks like." text="Dari recruitment dan onboarding, SOP kerja, attendance, scheduling, sampai quality control — kami membantu membangun ritme kerja yang membuat team dan outlet lebih siap." /><ul className="check-list"><li><Check size={17} />Recruitment & onboarding</li><li><Check size={17} />SOP, training & quality control</li><li><Check size={17} />Attendance, shift & payroll</li><li><Check size={17} />Employee self-service</li></ul><ArrowLink href="#inquiry">Pelajari F&B Operations</ArrowLink></div></div></section>

      <section className="growth-section section-pad" id="growth"><div className="container growth-grid"><div className="growth-copy"><SectionIntro eyebrow="GROWTH MARKETING" title="From a good product to a business people return to." text="Growth yang sehat dibangun dari pemahaman customer, campaign yang relevan, dan data yang membantu team belajar — bukan janji hasil instan." /><div className="growth-tags"><span><Handshake size={15} /> KOL partnerships</span><span><PenTool size={15} /> Content & campaigns</span><span><BarChart3 size={15} /> Sales measurement</span></div><ArrowLink href="https://kolmarketing.yumme.id">Lihat KOL Partnership</ArrowLink></div><div className="campaign-card"><div className="campaign-head"><span>GROWTH LOOP</span><Sparkles size={18} /></div><div className="campaign-content"><div className="campaign-quote"><Quote size={22} /><p>Campaign yang lebih dekat dengan customer, dan lebih mudah dipelajari oleh team.</p></div><div className="campaign-line"><span>Understand</span><span>Activate</span><span>Learn</span></div><div className="line-track"><i /><i /><i /></div></div></div></div></section>

      <section className="section-pad brands-section" id="brands"><div className="container"><div className="brand-heading"><SectionIntro eyebrow="BRANDS & PROOF OF WORK" title="Built in the real world." text="Kami membangun dan mengelola bisnis F&B dari dekat — bersama orang-orang yang menjalankannya setiap hari." /><span className="proof-note">No inflated numbers.<br />Just honest work.</span></div><article className="brand-card"><div className="brand-card-mark">D<span>T</span></div><div className="brand-card-copy"><span className="eyebrow">YUMME GROUP BRAND</span><h3>Djiwa Tentram</h3><p>Modern cafe & resto yang menjadi ruang nyata bagi kami untuk memahami outlet operations, customer experience, dan bagaimana sebuah brand tumbuh dari hari ke hari.</p><a className="text-link" href="https://djiwatentram.yumme.id">Kunjungi djiwatentram.yumme.id <ArrowUpRight size={15} /></a></div><div className="brand-card-side"><span>CASE STUDY / 01</span><div className="mini-bars"><i /><i /><i /><i /><i /></div></div></article></div></section>

      <section className="flywheel-section section-pad"><div className="container"><SectionIntro eyebrow="THE OPERATING FLYWHEEL" title="A better loop for better businesses." text="Setiap putaran memberi kami konteks baru untuk memperbaiki cara bisnis berjalan — dan pengalaman yang diterima customer." align="center" /><div className="flywheel" aria-label="Alur operasional Yumme"><svg viewBox="0 0 700 310" role="img" aria-labelledby="flywheel-title"><title id="flywheel-title">Operating flywheel dari memahami bisnis hingga bertumbuh</title><path className="fly-path" d="M 110 160 C 110 55, 590 55, 590 160 C 590 265, 110 265, 110 160" /><path className="fly-arrow" d="M 575 92 l 20 8 -13 16" /><path className="fly-arrow" d="M 125 228 l -20 -8 13 -16" /></svg>{[["01", "Understand", "the business", "fly-1"], ["02", "Design", "the operating system", "fly-2"], ["03", "Run", "the outlet", "fly-3"], ["04", "Measure", "the data", "fly-4"], ["05", "Improve", "the experience", "fly-5"], ["06", "Grow", "the business", "fly-6"]].map(([n, a, b, cls]) => <div className={`fly-node ${cls}`} key={n}><span>{n}</span><strong>{a}</strong><small>{b}</small></div>)}</div></div></section>

      <section className="audience-section section-pad" id="about"><div className="container audience-grid"><div><SectionIntro eyebrow="WHO WE HELP" title="For people building something that matters." text="Baik Anda sedang membuka outlet pertama atau menyusun ulang cara bisnis berjalan, kami mulai dari konteks Anda." /><ArrowLink href="#inquiry">Mulai percakapan</ArrowLink></div><div className="audience-cards"><div><Store size={20} /><span>01</span><h3>Pemilik cafe,<br />resto, & coffeeshop</h3></div><div><Network size={20} /><span>02</span><h3>Brand F&B yang<br />ingin scale up</h3></div><div><Settings2 size={20} /><span>03</span><h3>Operator yang<br />butuh sistem</h3></div><div><Zap size={20} /><span>04</span><h3>Bisnis yang ingin<br />terhubung lebih baik</h3></div></div></div></section>

      <section className="inquiry-section section-pad" id="inquiry"><div className="container inquiry-grid"><div className="inquiry-copy"><span className="eyebrow eyebrow-light">LET’S BUILD BETTER</span><h2>Ready to build a better F&B operation?</h2><p>Ceritakan sedikit tentang bisnis Anda. Kami akan menghubungi Anda untuk memahami kebutuhan dan konteksnya lebih jauh.</p><div className="inquiry-line"><span />Diskusi pertama selalu dimulai dari mendengar.</div></div><form className="inquiry-form" onSubmit={handleSubmit}><div className="form-row"><label>Nama<input name="name" required placeholder="Nama Anda" /></label><label>Nama bisnis<input name="business" required placeholder="Nama bisnis" /></label></div><div className="form-row"><label>Email / WhatsApp<input name="contact" required placeholder="email atau nomor WhatsApp" /></label><label>Kota<input name="city" placeholder="Kota bisnis" /></label></div><label>Kebutuhan utama<select name="need" defaultValue=""><option value="" disabled>Pilih kebutuhan</option><option>Operasional F&B</option><option>People & HR</option><option>Technology</option><option>Growth marketing</option><option>Eksplorasi kolaborasi</option></select></label><label>Ceritakan sedikit tentang bisnis Anda<textarea name="message" rows={3} placeholder="Apa yang sedang Anda bangun atau benahi?"></textarea></label>{submitted && <div className="form-honesty" role="status"><Check size={17} /> Terima kasih. Channel inquiry sedang kami siapkan — data ini belum dikirim ke server.</div>}<button className="button button-light" type="submit">Kirim inquiry <ArrowUpRight size={17} /></button><p className="form-note">Form ini adalah presentasi awal. Belum ada data yang dikirim atau disimpan.</p></form></div></section>
    </main>
    <footer className="site-footer"><div className="container footer-top"><div><Logo /><p>Building, operating, and growing<br />better F&B businesses.</p></div><div className="footer-links"><div><span>Explore</span><a href="#ecosystem">Ecosystem</a><a href="#operations">Operations</a><a href="#technology">Technology</a><a href="#growth">Growth</a></div><div><span>Brands</span><a href="#brands">Djiwa Tentram</a><a href="https://kolmarketing.yumme.id">KOL Partnership</a></div><div><span>Connect</span><a href="#inquiry">Diskusikan Bisnis Anda</a><a href="mailto:hello@yumme.id">hello@yumme.id</a></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Yumme Group. All rights reserved.</span><span>Made for better everyday operations.</span></div></footer>
  </div>;
}

function HeroVisual() {
  return <div className="hero-visual" aria-label="Ilustrasi ekosistem bisnis Yumme"><div className="hero-grid-lines" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-core"><span className="core-mark">Y</span><strong>Yumme</strong><small>connected operations</small></div><div className="hero-node node-outlet"><Store size={18} /><span>Outlet<br /><b>operations</b></span></div><div className="hero-node node-people"><Users size={18} /><span>People<br /><b>in motion</b></span></div><div className="hero-node node-data"><BarChart3 size={18} /><span>Data<br /><b>that helps</b></span></div><div className="hero-node node-growth"><Sparkles size={18} /><span>Customer<br /><b>growth</b></span></div><div className="hero-caption"><span className="caption-dot" />One ecosystem, moving together</div></div>;
}

export default App;
