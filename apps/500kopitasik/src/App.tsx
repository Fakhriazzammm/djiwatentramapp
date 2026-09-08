import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, ChevronRight, Compass, ExternalLink, Gift, Grid2X2, MapPin, Plus, Sparkles, Stamp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchPassport, requestCollectStamp, requestGoogleLogin, requestShopOnboarding, type PassportShop, type PassportState } from "./lib/api";

type Tab = "gallery" | "explore" | "collection";
const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function App() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("gallery");
  const [sheet, setSheet] = useState<"auth" | "visit" | "profile" | "onboard" | null>(null);
  const [selectedShop, setSelectedShop] = useState<PassportShop | null>(null);
  const [state, setState] = useState<PassportState | null>(null);
  const [onboardName, setOnboardName] = useState("");
  const [onboardMapsUrl, setOnboardMapsUrl] = useState("");
  const [onboardArea, setOnboardArea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setState(await fetchPassport());
    } catch (cause) {
      console.error("[500kopitasik] passport load failed:", cause);
      setError("Cerita belum bisa ditampilkan. Coba periksa koneksi internetmu, lalu tekan tombol di bawah.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openVisit = (shop?: PassportShop) => {
    if (!shop) { setTab("explore"); setToast("Pilih kedai official terlebih dahulu untuk mengumpulkan stamp."); return; }
    setSelectedShop(shop);
    if (!state?.authenticated) setSheet("auth"); else setSheet("visit");
  };
  const login = async () => { try { await requestGoogleLogin(); } catch (cause) { setToast(cause instanceof Error ? cause.message : "Google login belum bisa dimulai. Coba lagi."); } };
  const collectStamp = async () => {
    if (!selectedShop) { setToast("Pilih kedai official terlebih dahulu."); return; }
    setIsSubmitting(true);
    try {
      const result = await requestCollectStamp(selectedShop.shop_id, crypto.randomUUID());
      await load();
      setSheet(null);
      setToast(result?.status === "duplicate" ? "Kedai ini sudah ada di passport kamu." : result?.status === "pending_review" ? "Nama kedai sudah dicatat untuk diperiksa." : "Stamp tersimpan. Lengkapi foto kunjunganmu.");
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : "Stamp belum bisa disimpan. Coba lagi.");
    } finally { setIsSubmitting(false); }
  };
  const onboardShop = async () => {
    if (!onboardName.trim() || !onboardMapsUrl.trim()) { setToast("Nama kedai dan link Google Maps wajib diisi."); return; }
    setIsSubmitting(true);
    try { const result = await requestShopOnboarding({ name: onboardName.trim(), google_maps_url: onboardMapsUrl.trim(), area: onboardArea.trim() }); setSheet(null); setOnboardName(""); setOnboardMapsUrl(""); setOnboardArea(""); setToast(result?.message ?? "Pengajuan kedai diterima."); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "Data kedai belum bisa dikirim."); }
    finally { setIsSubmitting(false); }
  };
  const visitedCount = state?.collection.length ?? 0;
  const reward = state?.rewards.available ?? 0;

  return <div className="app-bg min-h-screen text-[#242321]"><main className="mx-auto min-h-screen w-full max-w-[480px] px-5 pb-28 pt-5 sm:px-6">
    <header className="flex items-center justify-between"><div className="flex items-center gap-3"><img src="/logo-500kopitasik.png" alt="Logo 500 Kopi Tasik" className="h-12 w-12 rounded-[18px] object-cover shadow-sm" /><div><p className="font-display text-[15px] font-extrabold tracking-[-.03em]">500 Kopi Tasik</p><p className="text-[11px] text-[#77736a]">Coffee passport Tasikmalaya</p></div></div><button className="icon-btn" aria-label="Buka profil" onClick={() => setSheet("profile")}><span className="avatar">{state?.customer?.name?.trim()?.slice(0, 1).toUpperCase() ?? "?"}</span></button></header>
    <section className="hero-card mt-5 overflow-hidden p-5"><div className="relative z-10"><p className="eyebrow">JELAJAHI KOTA, SATU CANGKIR</p><h1 className="mt-2 max-w-[300px] font-display text-[31px] font-extrabold leading-[1.05] tracking-[-.06em]">Setiap kedai punya cerita.</h1><p className="mt-3 max-w-[300px] text-[13px] leading-5 text-[#6b5d50]">Foto kunjunganmu, jadikan sticker, dan kumpulkan coffee shop Tasikmalaya.</p></div><div className="passport-mark" aria-hidden="true"><Stamp size={78} strokeWidth={1.1} /></div><div className="relative z-10 mt-5 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#87694e]">Progress passport</p><p className="mt-1 font-display text-2xl font-extrabold">{visitedCount} <span className="text-sm font-semibold text-[#8b8175]">/ 500</span></p></div><div className="progress-track"><span style={{ width: `${Math.max(visitedCount ? 1 : 0, Math.min(100, visitedCount / 5))}%` }} /></div></div></section>
    <section className="reward-card mt-4 flex items-center gap-3 p-4"><div className="reward-icon"><Gift size={19} /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[#7a6b5e]">Saldo reward Djiwa Pay</p><p className="mt-0.5 font-display text-xl font-extrabold">{formatRupiah(reward)}</p><p className="text-[11px] text-[#81766b]">Untuk menu Djiwa Tentram</p></div><button className="text-btn" onClick={() => setToast("Reward berasal dari sticker yang selesai dan tersimpan di server.")}>Info</button></section>
    <nav className="segmented mt-6" aria-label="Navigasi utama">{([ ["gallery", Grid2X2, "Gallery"], ["explore", Compass, "Explore"], ["collection", Stamp, "Collection"] ] as const).map(([key, Icon, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={16} /><span>{label}</span></button>)}</nav>
    {error && <div className="error-card mt-4" role="alert"><p>{error}</p><button onClick={() => void load()}>Coba lagi</button></div>}
    {!error && <AnimatePresence mode="wait"><motion.section key={tab} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .22 }} className="mt-5">
      {tab === "gallery" && <><div className="section-heading"><div><p className="eyebrow">CATATAN TERBARU</p><h2 className="section-title">Cerita di perjalanan</h2></div><button className="small-link" onClick={() => setTab("explore")}>Jelajah <ChevronRight size={15} /></button></div>{state?.visits.length ? <div className="visit-list mt-4">{state.visits.map((visit) => <article className="visit-card" key={visit.visit_id}><div className="visit-photo"><Camera size={20} /><small>Foto tersimpan</small></div><div><strong>{visit.title}</strong><small>{visit.shop_name} · {visit.status}</small></div></article>)}</div> : <div className="empty-card mt-4"><div className="empty-illustration"><Camera size={28} /></div><h3 className="mt-4 font-display text-lg font-extrabold">Belum ada cerita</h3><p className="mt-2 max-w-[260px] text-center text-[13px] leading-5 text-[#77736a]">Jelajahi kedai di Tasikmalaya dan simpan kunjungan pertamamu.</p><button className="primary-btn mt-5" onClick={() => setTab("explore")}><Compass size={18} /> Jelajahi kedai</button></div>}</>}
      {tab === "explore" && <><div className="section-heading"><div><p className="eyebrow">TASIKMALAYA</p><h2 className="section-title">Temukan kedai</h2></div><span className="location-pill"><MapPin size={13} /> Data resmi</span></div>{state?.shops.length ? <div className="shop-list mt-4">{state.shops.map((shop) => { const collected = state.collection.some((item) => item.shop_id === shop.shop_id); return <article className="shop-card" key={shop.shop_id} onClick={() => openVisit(shop)}><span className="shop-color"><CoffeeGlyph /></span><span className="min-w-0 flex-1 text-left"><strong>{shop.name}</strong><small>{shop.area ?? "Tasikmalaya"} · {shop.description ?? "Detail kedai belum diisi."}</small><small className="mt-1">Bid Rank {formatRupiah(shop.current_bid_amount || 0)}</small></span><span className="flex flex-col items-end gap-2"><span className={collected ? "status visited" : "status"}>{collected ? "COLLECTED" : "VISIT"}</span>{shop.google_maps_url && <a className="small-link" href={shop.google_maps_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Buka ${shop.name} di Google Maps`}><ExternalLink size={14} /> Maps</a>}</span></article>; })}</div> : <div className="empty-card mt-4"><Compass size={25} /><h3 className="mt-3 font-display text-lg font-extrabold">Belum ada coffee shop</h3><p className="mt-2 text-center text-[13px] text-[#77736a]">Catalog coffee shop belum tersedia di database.</p></div>}</>}
      {tab === "collection" && <><div className="section-heading"><div><p className="eyebrow">STICKER BOOK</p><h2 className="section-title">Koleksimu</h2></div><Sparkles size={19} className="text-[#ad8055]" /></div>{state?.collection.length ? <div className="collection-grid mt-4">{state.collection.map((item) => <button className="collection-item collected" key={item.shop_id} onClick={() => setToast(`${item.shop_name} sudah ada di passport kamu.`)}><span className="stamp-mini"><Stamp size={29} /></span><strong>{item.shop_name}</strong><small>{item.visit_count} kunjungan · {item.sticker_completed ? "Sticker selesai" : "Sticker diproses"}</small></button>)}</div> : <div className="empty-card mt-4"><Stamp size={26} /><h3 className="mt-3 font-display text-lg font-extrabold">Koleksi masih kosong</h3><p className="mt-2 text-center text-[13px] text-[#77736a]">Stamp akan muncul setelah visit tersimpan.</p></div>}</>}
    </motion.section></AnimatePresence>}
  </main><button className="floating-cta" onClick={() => openVisit()}><Plus size={20} /> Collect Stamp</button>{toast && <div className="toast" role="status" onClick={() => setToast("")}>{toast}</div>}
  <AnimatePresence>{sheet && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSheet(null)}><motion.div initial={reduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={reduceMotion ? undefined : { y: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 34 }} className="bottom-sheet" role="dialog" aria-modal="true"><button className="close-btn" aria-label="Tutup" onClick={() => setSheet(null)}><X size={18} /></button>
    {sheet === "auth" && <div className="sheet-content"><div className="sheet-icon"><Sparkles /></div><p className="eyebrow">SATU LANGKAH LAGI</p><h2 className="sheet-title">Kumpulkan momenmu.</h2><p className="sheet-copy">Login diperlukan untuk membuat sticker dan menerima saldo reward Djiwa Pay.</p><button className="google-btn full" onClick={() => void login()}><span>G</span> Lanjut dengan Google</button><p className="legal-copy">Login memakai akun Google melalui Better Auth.</p></div>}
    {sheet === "visit" && <div className="sheet-content"><p className="eyebrow">COLLECT STAMP OFFICIAL</p><h2 className="sheet-title">{selectedShop?.name}</h2><p className="sheet-copy">Stamp passport akan memakai data resmi kedai ini.</p>{selectedShop?.google_maps_url && <a className="djiwa-link" href={selectedShop.google_maps_url} target="_blank" rel="noreferrer">Buka lokasi di Google Maps <ExternalLink size={16} /></a>}<button className="primary-btn full" onClick={() => void collectStamp()} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Stamp"}</button><p className="legal-copy">Satu kedai official hanya bisa dikumpulkan sekali.</p></div>}
    {sheet === "onboard" && <div className="sheet-content"><p className="eyebrow">DAFTARKAN KEDAI</p><h2 className="sheet-title">Jadikan kedaimu official.</h2><p className="sheet-copy">Isi link Google Maps agar data kedai yang dipakai di passport benar dan mudah ditemukan.</p><input className="shop-name-input" value={onboardName} onChange={(event) => setOnboardName(event.target.value)} placeholder="Nama kedai" maxLength={160} autoComplete="organization" /><input className="shop-name-input" value={onboardMapsUrl} onChange={(event) => setOnboardMapsUrl(event.target.value)} placeholder="https://maps.google.com/..." inputMode="url" autoComplete="url" /><input className="shop-name-input" value={onboardArea} onChange={(event) => setOnboardArea(event.target.value)} placeholder="Area, misalnya Cihideung" maxLength={80} /><button className="primary-btn full" onClick={() => void onboardShop()} disabled={isSubmitting}>{isSubmitting ? "Mengirim..." : "Kirim untuk verifikasi"}</button><p className="legal-copy">Kedai baru tampil di Explore dan dapat memakai Bid Rank setelah disetujui.</p></div>}
    {sheet === "profile" && <div className="sheet-content"><div className="profile-head"><span className="profile-avatar">{state?.customer?.name?.slice(0, 1).toUpperCase() ?? "?"}</span><div><p className="eyebrow">PASSPORT HOLDER</p><h2 className="sheet-title">{state?.customer?.name ?? "Tamu"}</h2></div></div><div className="profile-row"><span>Saldo reward</span><strong>{formatRupiah(reward)}</strong></div><div className="profile-row"><span>Koleksi unik</span><strong>{visitedCount} / 500</strong></div>{!state?.authenticated && <button className="google-btn full" onClick={() => setSheet("auth")}><span>G</span> Login dengan Google</button>}{state?.authenticated && <button className="primary-btn full" onClick={() => setSheet("onboard")}><Plus size={18} /> Daftarkan kedai</button>}<a className="djiwa-link" href="https://djiwatentram.yumme.id" target="_blank" rel="noreferrer">Gunakan reward di Djiwa Tentram <ChevronRight size={16} /></a></div>}
  </motion.div></div>}</AnimatePresence></div>;
}
function CoffeeGlyph() { return <span className="coffee-glyph">☕</span>; }
