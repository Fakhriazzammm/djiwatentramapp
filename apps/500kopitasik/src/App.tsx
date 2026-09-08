import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, ChevronRight, Compass, Gift, Grid2X2, MapPin, Plus, Sparkles, Stamp, X } from "lucide-react";
import { useState } from "react";

type Tab = "gallery" | "explore" | "collection";
type Shop = { name: string; area: string; color: string; visited: boolean; detail: string };

const shops: Shop[] = [
  { name: "Kopi Pojok", area: "Cihideung", color: "#d9a66e", visited: true, detail: "Sudut hangat untuk kopi sore dan obrolan panjang." },
  { name: "Ruang Seduh", area: "Tawang", color: "#9db4a4", visited: false, detail: "Manual brew lokal dengan suasana tenang." },
  { name: "Kedai Niskala", area: "Indihiang", color: "#a9a1c9", visited: false, detail: "Kopi, buku, dan cerita dari Tasik." },
  { name: "Sora Coffee", area: "Mangkubumi", color: "#d78f7d", visited: false, detail: "Tempat kecil dengan menu yang berani." },
];

const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function App() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("gallery");
  const [sheet, setSheet] = useState<"auth" | "visit" | "profile" | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [visitedCount, setVisitedCount] = useState(1);
  const [toast, setToast] = useState("");

  const openVisit = (shop?: Shop) => {
    setSelectedShop(shop ?? shops[0]);
    if (!signedIn) setSheet("auth"); else setSheet("visit");
  };

  const googleLogin = async () => {
    try {
      const response = await fetch("https://djiwatentram.yumme.id/api/auth/sign-in/social", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: window.location.href }),
      });
      const result = await response.json().catch(() => null) as { url?: string } | null;
      if (result?.url) window.location.assign(result.url);
      else { setSignedIn(true); setSheet("visit"); }
    } catch { setToast("Login Google belum tersedia di environment ini."); }
  };

  const completeVisit = () => {
    setVisitedCount((count) => Math.min(500, count + (selectedShop?.visited ? 0 : 1)));
    setSheet(null);
    setToast("Stamp tersimpan · reward Rp500 menunggu sticker selesai");
    window.setTimeout(() => setToast(""), 3600);
  };

  return (
    <div className="app-bg min-h-screen text-[#242321]">
      <main className="mx-auto min-h-screen w-full max-w-[480px] px-5 pb-28 pt-5 sm:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-500kopitasik.png" alt="Logo 500 Kopi Tasik" className="h-12 w-12 rounded-[18px] object-cover shadow-sm" />
            <div><p className="font-display text-[15px] font-extrabold tracking-[-.03em]">500 Kopi Tasik</p><p className="text-[11px] text-[#77736a]">Coffee passport Tasikmalaya</p></div>
          </div>
          <button className="icon-btn" aria-label="Buka profil" onClick={() => setSheet("profile")}><span className="avatar">{signedIn ? "F" : "?"}</span></button>
        </header>

        <section className="hero-card mt-5 overflow-hidden p-5">
          <div className="relative z-10"><p className="eyebrow">JELAJAHI KOTA, SATU CANGKIR</p><h1 className="mt-2 max-w-[300px] font-display text-[31px] font-extrabold leading-[1.05] tracking-[-.06em]">Setiap kedai punya cerita.</h1><p className="mt-3 max-w-[300px] text-[13px] leading-5 text-[#6b5d50]">Foto kunjunganmu, jadikan sticker, dan kumpulkan coffee shop Tasikmalaya.</p></div>
          <div className="passport-mark" aria-hidden="true"><Stamp size={78} strokeWidth={1.1} /></div>
          <div className="relative z-10 mt-5 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#87694e]">Progress passport</p><p className="mt-1 font-display text-2xl font-extrabold">{visitedCount} <span className="text-sm font-semibold text-[#8b8175]">/ 500</span></p></div><div className="progress-track"><span style={{ width: `${Math.max(2, (visitedCount / 500) * 100)}%` }} /></div></div>
        </section>

        <section className="reward-card mt-4 flex items-center gap-3 p-4"><div className="reward-icon"><Gift size={19} /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[#7a6b5e]">Saldo reward Djiwa Pay</p><p className="mt-0.5 font-display text-xl font-extrabold">{formatRupiah(visitedCount * 500)}</p><p className="text-[11px] text-[#81766b]">Untuk menu Djiwa Tentram</p></div><button className="text-btn" onClick={() => setToast("Reward masuk setelah sticker berhasil dibuat.")}>Info</button></section>

        <nav className="segmented mt-6" aria-label="Navigasi utama">{([ ["gallery", Grid2X2, "Gallery"], ["explore", Compass, "Explore"], ["collection", Stamp, "Collection"] ] as const).map(([key, Icon, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={16} /><span>{label}</span></button>)}</nav>

        <AnimatePresence mode="wait"><motion.section key={tab} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .22 }} className="mt-5">
          {tab === "gallery" && <><div className="section-heading"><div><p className="eyebrow">CATATAN TERBARU</p><h2 className="section-title">Cerita di perjalanan</h2></div><button className="small-link" onClick={() => setTab("explore")}>Jelajah <ChevronRight size={15} /></button></div><div className="empty-card mt-4"><div className="empty-illustration"><Camera size={28} /></div><h3 className="mt-4 font-display text-lg font-extrabold">Belum ada cerita</h3><p className="mt-2 max-w-[260px] text-center text-[13px] leading-5 text-[#77736a]">Jadikan kunjungan kopi pertamamu sebagai halaman pembuka.</p><button className="primary-btn mt-5" onClick={() => openVisit() }><Plus size={18} /> Collect Stamp</button></div></>}
          {tab === "explore" && <><div className="section-heading"><div><p className="eyebrow">TASIKMALAYA</p><h2 className="section-title">Temukan kedai</h2></div><span className="location-pill"><MapPin size={13} /> Kota Tasik</span></div><div className="shop-list mt-4">{shops.map((shop) => <button className="shop-card" key={shop.name} onClick={() => { setSelectedShop(shop); setSheet("visit"); }}><span className="shop-color" style={{ background: shop.color }}><CoffeeGlyph /></span><span className="min-w-0 flex-1 text-left"><strong>{shop.name}</strong><small>{shop.area} · {shop.detail}</small></span><span className={shop.visited ? "status visited" : "status"}>{shop.visited ? "COLLECTED" : "VISIT"}</span></button>)}</div></>}
          {tab === "collection" && <><div className="section-heading"><div><p className="eyebrow">STICKER BOOK</p><h2 className="section-title">Koleksimu</h2></div><Sparkles size={19} className="text-[#ad8055]" /></div><div className="collection-grid mt-4">{shops.map((shop) => <button className={`collection-item ${shop.visited ? "collected" : "locked"}`} key={shop.name} onClick={() => shop.visited && setToast(`${shop.name} sudah ada di passport kamu.`)}><span className="stamp-mini">{shop.visited ? <Stamp size={29} /> : "?"}</span><strong>{shop.name}</strong><small>{shop.visited ? "Stamp collected" : "Belum dikunjungi"}</small></button>)}</div></>}
        </motion.section></AnimatePresence>
      </main>

      <button className="floating-cta" onClick={() => openVisit()}><Plus size={20} /> Collect Stamp</button>
      {toast && <div className="toast" role="status">{toast}</div>}

      <AnimatePresence>{sheet && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSheet(null)}><motion.div initial={reduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={reduceMotion ? undefined : { y: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 34 }} className="bottom-sheet" role="dialog" aria-modal="true">
        <button className="close-btn" aria-label="Tutup" onClick={() => setSheet(null)}><X size={18} /></button>
        {sheet === "auth" && <div className="sheet-content"><div className="sheet-icon"><Sparkles /></div><p className="eyebrow">SATU LANGKAH LAGI</p><h2 className="sheet-title">Kumpulkan momenmu.</h2><p className="sheet-copy">Login diperlukan untuk membuat sticker dan menerima saldo reward Djiwa Pay.</p><button className="google-btn" onClick={() => void googleLogin()}><span>G</span> Lanjut dengan Google</button><p className="legal-copy">Dengan melanjutkan, kamu menyetujui pengalaman passport digital 500 Kopi Tasik.</p></div>}
        {sheet === "visit" && <div className="sheet-content"><p className="eyebrow">COLLECT STAMP</p><h2 className="sheet-title">{selectedShop?.name ?? "Pilih kedai"}</h2><p className="sheet-copy">Dokumentasikan kunjunganmu. Sticker akan dibuat setelah foto dan cerita tersimpan.</p><label className="upload-box"><Camera size={23} /><span>Ambil atau pilih foto</span><input type="file" accept="image/*" capture="environment" /></label><input className="field" placeholder="Judul cerita" /><textarea className="field textarea" placeholder="Ceritakan kopi hari ini..." /><button className="primary-btn full" onClick={completeVisit}><Sparkles size={18} /> Simpan & buat sticker</button></div>}
        {sheet === "profile" && <div className="sheet-content"><div className="profile-head"><span className="profile-avatar">{signedIn ? "F" : "?"}</span><div><p className="eyebrow">PASSPORT HOLDER</p><h2 className="sheet-title">{signedIn ? "Fakhri" : "Tamu"}</h2></div></div><div className="profile-row"><span>Saldo reward</span><strong>{formatRupiah(visitedCount * 500)}</strong></div><div className="profile-row"><span>Koleksi unik</span><strong>{visitedCount} / 500</strong></div>{!signedIn && <button className="google-btn full" onClick={() => setSheet("auth")}><span>G</span> Login dengan Google</button>}<a className="djiwa-link" href="https://djiwatentram.yumme.id" target="_blank" rel="noreferrer">Gunakan reward di Djiwa Tentram <ChevronRight size={16} /></a></div>}
      </motion.div></div>}</AnimatePresence>
    </div>
  );
}
function CoffeeGlyph() { return <span className="coffee-glyph">☕</span>; }
