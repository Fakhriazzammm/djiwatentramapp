import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, BarChart3, Building2, Check, ChevronRight, CircleDollarSign, Compass, Database, LockKeyhole, Network, ShieldCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({ component: InvestorLanding });

type PublicSnapshot = {
  settledOrders: number | null;
  orderValue: number | null;
  averageOrderValue: number | null;
  firstDateWib: string | null;
  lastDateWib: string | null;
  ecosystemSettledOrders: number | null;
  ecosystemOrderValue: number | null;
  ecosystemAverageOrderValue: number | null;
  ecosystemFirstDateWib: string | null;
  ecosystemLastDateWib: string | null;
  completeness: "partial" | "unavailable";
};

const INVESTOR_API_BASE = import.meta.env.VITE_INVESTOR_API_URL?.trim() || "https://djiwatentram.yumme.id";
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatRupiah(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Belum tersedia";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatWibDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

const conceptImages = [
  { src: "/images/investor/concept-dining-room.webp", alt: "Ilustrasi konsep ruang hospitality, bukan foto lokasi operasional Djiwa Tentram.", title: "Pengalaman hospitality", description: "Visual konsep suasana ruang makan—bukan dokumentasi cabang Djiwa Tentram." },
  { src: "/images/investor/concept-culinary-craft.webp", alt: "Ilustrasi konsep proses menyiapkan hidangan, bukan menu atau produk resmi.", title: "Craft kuliner", description: "Visual konsep proses penyajian—bukan foto menu atau produk resmi." },
  { src: "/images/investor/concept-expansion-planning.webp", alt: "Ilustrasi konsep perencanaan lokasi, bukan peta atau rencana cabang yang disetujui.", title: "Perencanaan ekspansi", description: "Visual konsep perencanaan—bukan peta atau rencana cabang yang disetujui." },
];

function ProjectionPlanner() {
  const [monthlyRevenue, setMonthlyRevenue] = useState(100_000_000);
  const [netMargin, setNetMargin] = useState(8);
  const [growth, setGrowth] = useState(10);
  const [revenueMultiple, setRevenueMultiple] = useState(1.5);
  const scenarios = [
    { name: "Konservatif", growth: Math.max(0, growth - 5), color: "#637187" },
    { name: "Dasar", growth, color: "#c9a85b" },
    { name: "Optimistis", growth: growth + 5, color: "#356b51" },
  ];
  const baseAnnualRevenue = monthlyRevenue * 12;
  const years = Array.from({ length: 6 }, (_, year) => year);
  const baseFiveYearRevenue = baseAnnualRevenue * (1 + growth / 100) ** 5;
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  const maxRevenue = Math.max(1, ...scenarios.flatMap((scenario) => years.map((year) => baseAnnualRevenue * (1 + scenario.growth / 100) ** year)));
  const maxProfit = Math.max(1, maxRevenue * netMargin / 100);
  const chartPoints = (scenarioGrowth: number, margin = 100) => years.map((year, index) => {
    const revenue = baseAnnualRevenue * (1 + scenarioGrowth / 100) ** year * margin / 100;
    const x = 36 + (index / 5) * 500;
    const y = 180 - (revenue / (margin === 100 ? maxRevenue : maxProfit)) * 150;
    return `${x},${y}`;
  }).join(" ");

  return (
    <section id="proyeksi" className="border-y border-djiwa-line bg-djiwa-surface">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-navy-soft">Simulator · asumsi dapat diubah</p><h2 className="investor-display mt-3 text-3xl font-semibold leading-tight text-djiwa-ink sm:text-4xl">Uji skenario, bukan janji hasil.</h2></div>
          <p className="max-w-2xl text-[13px] leading-6 text-djiwa-muted">Belum tersedia rangkaian laporan historis terverifikasi untuk menyusun proyeksi dan valuasi perusahaan. Angka awal di bawah adalah contoh hipotetis, bukan data aktual Djiwa Tentram atau penawaran investasi. Ubah asumsi untuk simulasi Anda.</p>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <form className="investor-panel space-y-4 p-5" onSubmit={(event) => event.preventDefault()} aria-label="Asumsi simulasi">
            <h3 className="text-[14px] font-bold text-djiwa-navy">Asumsi simulasi (dapat diedit)</h3>
            <label className="block text-[11px] font-semibold text-djiwa-muted">Omzet bulanan awal (Rp)<input type="number" min="0" step="1000000" value={monthlyRevenue} onChange={(event) => setMonthlyRevenue(Math.max(0, Number(event.target.value) || 0))} className="investor-focus mt-1.5 min-h-11 w-full rounded-xl border border-djiwa-line bg-white px-3 text-sm tabular-nums text-djiwa-ink" /></label>
            <label className="block text-[11px] font-semibold text-djiwa-muted">Margin laba bersih asumsi (%)<input type="number" min="0" max="100" step="0.5" value={netMargin} onChange={(event) => setNetMargin(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="investor-focus mt-1.5 min-h-11 w-full rounded-xl border border-djiwa-line bg-white px-3 text-sm tabular-nums text-djiwa-ink" /></label>
            <label className="block text-[11px] font-semibold text-djiwa-muted">Pertumbuhan omzet tahunan dasar (%)<input type="number" min="0" max="200" step="1" value={growth} onChange={(event) => setGrowth(Math.min(200, Math.max(0, Number(event.target.value) || 0)))} className="investor-focus mt-1.5 min-h-11 w-full rounded-xl border border-djiwa-line bg-white px-3 text-sm tabular-nums text-djiwa-ink" /></label>
            <label className="block text-[11px] font-semibold text-djiwa-muted">Kelipatan valuasi omzet tahunan (x)<input type="number" min="0" max="20" step="0.1" value={revenueMultiple} onChange={(event) => setRevenueMultiple(Math.min(20, Math.max(0, Number(event.target.value) || 0)))} className="investor-focus mt-1.5 min-h-11 w-full rounded-xl border border-djiwa-line bg-white px-3 text-sm tabular-nums text-djiwa-ink" /></label>
            <p className="rounded-xl bg-djiwa-warning-soft p-3 text-[10px] leading-5 text-djiwa-warning-ink">Contoh awal: omzet Rp100 juta/bulan, margin 8%, pertumbuhan 10%, dan kelipatan 1,5x. Semua asumsi ini ilustratif dan harus diganti dengan laporan perusahaan yang tervalidasi.</p>
          </form>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="investor-panel p-4"><p className="text-[10px] font-semibold text-djiwa-muted">Valuasi indikatif hari ini*</p><p className="mt-2 text-lg font-bold tabular-nums text-djiwa-ink">{rupiah(baseAnnualRevenue * revenueMultiple)}</p><p className="mt-1 text-[9px] text-djiwa-muted">Omzet tahunan × {revenueMultiple}x</p></article>
              <article className="investor-panel p-4"><p className="text-[10px] font-semibold text-djiwa-muted">Laba bersih tahunan dasar*</p><p className="mt-2 text-lg font-bold tabular-nums text-djiwa-ink">{rupiah(baseAnnualRevenue * netMargin / 100)}</p><p className="mt-1 text-[9px] text-djiwa-muted">Omzet × margin asumsi</p></article>
              <article className="investor-panel p-4"><p className="text-[10px] font-semibold text-djiwa-muted">Laba bersih tahunan · tahun ke-5*</p><p className="mt-2 text-lg font-bold tabular-nums text-djiwa-ink">{rupiah(baseFiveYearRevenue * netMargin / 100)}</p><p className="mt-1 text-[9px] text-djiwa-muted">Margin diasumsikan tetap</p></article>
              <article className="investor-panel p-4"><p className="text-[10px] font-semibold text-djiwa-muted">Valuasi indikatif tahun ke-5*</p><p className="mt-2 text-lg font-bold tabular-nums text-djiwa-ink">{rupiah(baseFiveYearRevenue * revenueMultiple)}</p><p className="mt-1 text-[9px] text-djiwa-muted">Omzet dasar tumbuh majemuk</p></article>
            </div>
            <div className="investor-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-[13px] font-bold text-djiwa-navy">Proyeksi omzet tahunan · 5 tahun</h3><p className="mt-1 text-[10px] text-djiwa-muted">Simulasi majemuk berdasarkan skenario pertumbuhan</p></div><span className="rounded-full bg-djiwa-warning-soft px-2.5 py-1 text-[9px] font-bold text-djiwa-warning-ink">ILUSTRASI</span></div>
              <div className="mt-4 overflow-hidden"><svg viewBox="0 0 560 220" role="img" aria-label="Grafik proyeksi omzet hipotetis lima tahun untuk tiga skenario" className="h-auto w-full">
                {[0, 1, 2, 3].map((line) => <g key={line}><line x1="36" x2="536" y1={30 + line * 50} y2={30 + line * 50} stroke="#e3e8ef" strokeDasharray="4 5" /></g>)}
                {scenarios.map((scenario) => <polyline key={scenario.name} points={chartPoints(scenario.growth)} fill="none" stroke={scenario.color} strokeWidth={scenario.name === "Dasar" ? 3 : 2} strokeDasharray={scenario.name === "Dasar" ? undefined : "5 4"} strokeLinecap="round" strokeLinejoin="round" />)}
                {years.map((year, index) => <text key={year} x={36 + (index / 5) * 500} y="205" textAnchor="middle" fontSize="10" fill="#637187">{year === 0 ? "Hari ini" : `Th ${year}`}</text>)}
              </svg></div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{scenarios.map((scenario) => <span key={scenario.name} className="inline-flex items-center gap-1.5 text-[10px] text-djiwa-muted"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: scenario.color }} />{scenario.name} · {scenario.growth}%</span>)}</div>
              <div className="mt-5 border-t border-djiwa-line pt-4"><h4 className="text-[11px] font-bold text-djiwa-navy">Proyeksi laba bersih tahunan · margin {netMargin}% diasumsikan tetap</h4><svg viewBox="0 0 560 220" role="img" aria-label="Grafik proyeksi laba bersih hipotetis lima tahun untuk tiga skenario" className="mt-2 h-auto w-full">
                {[0, 1, 2, 3].map((line) => <line key={line} x1="36" x2="536" y1={30 + line * 50} y2={30 + line * 50} stroke="#e3e8ef" strokeDasharray="4 5" />)}
                {scenarios.map((scenario) => <polyline key={scenario.name} points={chartPoints(scenario.growth, netMargin)} fill="none" stroke={scenario.color} strokeWidth={scenario.name === "Dasar" ? 3 : 2} strokeDasharray={scenario.name === "Dasar" ? undefined : "5 4"} strokeLinecap="round" strokeLinejoin="round" />)}
                {years.map((year, index) => <text key={year} x={36 + (index / 5) * 500} y="205" textAnchor="middle" fontSize="10" fill="#637187">{year === 0 ? "Hari ini" : `Th ${year}`}</text>)}
              </svg></div>
              <p className="mt-3 text-[10px] leading-5 text-djiwa-muted">*Valuasi hanya ilustrasi berbasis omzet, bukan penilaian independen atau harga saham. Tidak memperhitungkan utang/kas, aset, pajak, struktur kepemilikan, risiko, atau transaksi pembanding. Margin laba diasumsikan tetap; skenario bukan ramalan.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InvestmentCalculator() {
  const [investment, setInvestment] = useState(100_000_000);
  const projectionYears = 5;
  const systemAssumptions = { revenuePerInvestment: 12, netMargin: 8, profitShare: 20, offeredOwnership: 5, annualGrowth: 10 };
  const projectedRevenue = investment * systemAssumptions.revenuePerInvestment;
  const netMargin = systemAssumptions.netMargin;
  const profitShare = systemAssumptions.profitShare;
  const offeredOwnership = systemAssumptions.offeredOwnership;
  const annualGrowth = systemAssumptions.annualGrowth;
  const annualProfit = projectedRevenue * netMargin / 100;
  const investorProfitShare = annualProfit * profitShare / 100;
  const companyProfitShare = annualProfit - investorProfitShare;
  const estimatedPayback = investorProfitShare > 0 ? investment / investorProfitShare : 0;
  const impliedPostMoney = offeredOwnership > 0 ? investment / (offeredOwnership / 100) : 0;
  const projections = Array.from({ length: projectionYears }, (_, index) => {
    const year = index + 1;
    const revenue = projectedRevenue * (1 + annualGrowth / 100) ** index;
    const profit = revenue * netMargin / 100;
    return { year, revenue, profit, investorShare: profit * profitShare / 100, companyShare: profit * (100 - profitShare) / 100 };
  });
  const cumulativeRevenue = projections.reduce((total, item) => total + item.revenue, 0);
  const cumulativeInvestorShare = projections.reduce((total, item) => total + item.investorShare, 0);
  const cumulativeCompanyShare = projections.reduce((total, item) => total + item.companyShare, 0);
  const finalYearValue = projections[projections.length - 1]?.revenue ?? 0;
  const maxRevenue = Math.max(1, ...projections.map((item) => item.revenue));
  const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

  return (
    <article className="investor-panel p-5 sm:p-6" id="kalkulator-valuasi">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-djiwa-navy-soft">Kalkulator · asumsi dapat diubah</p><h3 className="mt-2 text-xl font-bold text-djiwa-navy">Simulasikan peluang investasi</h3></div><TrendingUp className="shrink-0 text-djiwa-navy-soft" size={20} aria-hidden="true" /></div>
      <p className="mt-3 text-[12px] leading-6 text-djiwa-muted">Uji hubungan antara modal, proyeksi, kepemilikan, dan pembagian hasil. Angka ini ilustratif untuk diskusi awal—bukan valuasi resmi, janji keuntungan, atau penawaran efek.</p>
      <div className="mt-5 rounded-2xl border border-djiwa-line bg-djiwa-surface-muted p-4"><div className="flex items-end justify-between gap-3"><label htmlFor="investment-slider" className="text-[11px] font-bold text-djiwa-navy">Geser nilai modal investasi</label><output htmlFor="investment-slider" className="text-right text-lg font-bold tabular-nums text-djiwa-navy">{rupiah(investment)}</output></div><input id="investment-slider" type="range" min={50_000_000} max={5_000_000_000} step={50_000_000} value={investment} onChange={(event) => setInvestment(Number(event.target.value))} className="investor-range mt-5 w-full" aria-label="Nilai modal investasi" /><div className="mt-2 flex justify-between text-[10px] text-djiwa-muted"><span>Rp50 jt</span><span>Rp5 M</span></div><p className="mt-4 text-[10px] leading-5 text-djiwa-muted">Satu input saja. Sistem otomatis menghitung proyeksi omzet, margin, pembagian hasil, porsi kepemilikan, dan estimasi balik modal menggunakan asumsi dasar yang sama untuk menjaga perbandingan tetap konsisten.</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><MetricTile label="Asumsi omzet tahunan" value={rupiah(projectedRevenue)} /><MetricTile label="Margin laba bersih sistem" value={`${netMargin}%`} /><MetricTile label="Pembagian hasil investor" value={`${profitShare}%`} /><MetricTile label="Porsi kepemilikan acuan" value={`${offeredOwnership}%`} /></div>
      <div className="mt-4 rounded-2xl border border-djiwa-line bg-djiwa-surface-muted p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-djiwa-navy-soft">Pembagian laba bersih</p><h4 className="mt-1 text-sm font-bold text-djiwa-navy">Siapa menerima bagian berapa?</h4></div><span className="rounded-full bg-djiwa-navy px-2.5 py-1 text-[10px] font-bold text-white">100% dialokasikan</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-djiwa-gold-border bg-djiwa-gold-soft p-3"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-djiwa-warning-ink">Investor</span><strong className="text-sm tabular-nums text-djiwa-warning-ink">{profitShare}%</strong></div><p className="mt-2 text-lg font-bold tabular-nums text-djiwa-warning-ink">{rupiah(investorProfitShare)}</p><p className="mt-1 text-[10px] leading-4 text-djiwa-warning-ink">Estimasi bagian per tahun dari laba bersih.</p></div><div className="rounded-xl border border-djiwa-line bg-djiwa-navy p-3"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-white">Yumme · brand Djiwa Tentram</span><strong className="text-sm tabular-nums text-djiwa-gold-highlight">{100 - profitShare}%</strong></div><p className="mt-2 text-lg font-bold tabular-nums text-white">{rupiah(companyProfitShare)}</p><p className="mt-1 text-[10px] leading-4 text-djiwa-inverse-muted">Estimasi bagian perusahaan per tahun dari laba bersih.</p></div></div><p className="mt-3 text-[10px] leading-5 text-djiwa-muted">Pembagian di atas adalah simulasi berdasarkan asumsi profit sharing, bukan ketentuan kontraktual. Porsi kepemilikan saham dan hak ekonomi final dapat berbeda setelah term sheet dan perjanjian disepakati.</p></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><MetricTile label="Valuasi pasca-investasi tersirat" value={rupiah(impliedPostMoney)} /><MetricTile label="Estimasi laba tahunan" value={rupiah(annualProfit)} /><MetricTile label="Bagian hasil investor / tahun" value={rupiah(investorProfitShare)} /><MetricTile label="Estimasi periode balik modal" value={estimatedPayback > 0 ? `${estimatedPayback.toFixed(1)} tahun` : "—"} /></div>
      <div className="mt-5 rounded-2xl border border-djiwa-line bg-djiwa-surface-muted p-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-djiwa-navy-soft">Proyeksi 5 tahun</p><h4 className="mt-1 text-sm font-bold text-djiwa-navy">Lintasan omzet tahunan</h4></div><span className="text-right text-[10px] leading-4 text-djiwa-muted">Pertumbuhan asumsi<br /><strong className="text-djiwa-navy">{annualGrowth}% / tahun</strong></span></div><div className="mt-5 flex h-36 items-end gap-2" aria-label="Grafik proyeksi omzet lima tahun">{projections.map((item) => <div key={item.year} className="flex min-w-0 flex-1 flex-col items-center gap-1"><span className="text-[9px] font-semibold tabular-nums text-djiwa-navy">{new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(item.revenue)}</span><div className="flex h-24 w-full items-end rounded-t-lg bg-djiwa-navy/5"><div className="w-full rounded-t-lg bg-djiwa-gold transition-[height]" style={{ height: `${Math.max(8, item.revenue / maxRevenue * 100)}%` }} /></div><span className="text-[9px] text-djiwa-muted">Tahun {item.year}</span></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-djiwa-line pt-3 text-[10px] text-djiwa-muted"><span>Omzet tahun pertama: <strong className="text-djiwa-navy">{rupiah(projections[0]?.revenue ?? 0)}</strong></span><span>Tahun kelima: <strong className="text-djiwa-navy">{rupiah(finalYearValue)}</strong></span></div></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2"><MetricTile label="Akumulasi omzet 5 tahun" value={rupiah(cumulativeRevenue)} /><MetricTile label="Akumulasi bagian investor" value={rupiah(cumulativeInvestorShare)} /><MetricTile label="Akumulasi bagian Yumme · Djiwa Tentram" value={rupiah(cumulativeCompanyShare)} /><MetricTile label="Laba bersih tahun kelima" value={rupiah(projections[projections.length - 1]?.profit ?? 0)} /></div>
      <p className="mt-4 rounded-xl bg-djiwa-warning-soft p-3 text-[10px] leading-5 text-djiwa-warning-ink">Struktur final dapat berupa saham, bagi hasil, pinjaman, atau instrumen lain setelah uji tuntas, persetujuan pemilik, dan peninjauan legal. Kalkulator ini tidak menghitung pajak, dilusi, biaya modal, arus kas, atau risiko kerugian. Proyeksi bukan janji performa; gunakan skenario konservatif dan validasi dengan laporan aktual.</p>
    </article>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-djiwa-line bg-djiwa-surface-muted p-3"><p className="text-[10px] leading-4 text-djiwa-muted">{label}</p><p className="mt-1 text-sm font-bold tabular-nums text-djiwa-navy">{value}</p></div>;
}

function InvestorLanding() {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`${INVESTOR_API_BASE}/api/investor/public-snapshot`, { headers: { Accept: "application/json" } })
      .then((response) => { if (!response.ok) throw new Error("Snapshot unavailable"); return response.json(); })
      .then((payload: { success?: boolean; data?: PublicSnapshot }) => {
        if (active && payload.success && payload.data) setSnapshot(payload.data);
      })
      .catch(() => { if (active) setSnapshot(null); })
      .finally(() => { if (active) setSnapshotLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="investor-page">
      <header className="investor-nav sticky top-0 z-30 border-b border-djiwa-line/70">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-7 lg:px-10">
          <a href="#top" className="investor-focus flex items-center gap-3 rounded-xl" aria-label="Djiwa Tentram Investor Relations">
            <img src="/logo-djiwa.png" alt="" aria-hidden="true" className="h-10 w-10 rounded-[14px] object-contain" />
            <span className="leading-tight"><span className="block text-[13px] font-bold text-djiwa-navy">Djiwa Tentram</span><span className="text-[10px] font-semibold uppercase tracking-[.17em] text-djiwa-muted">Investor relations</span></span>
          </a>
          <nav className="hidden items-center gap-7 text-[13px] font-semibold text-djiwa-muted md:flex" aria-label="Navigasi utama">
            <a className="transition-colors hover:text-djiwa-navy" href="#thesis">Tesis pertumbuhan</a>
            <a className="transition-colors hover:text-djiwa-navy" href="#data">Data transaksi</a>
            <a className="transition-colors hover:text-djiwa-navy" href="#process">Cara bermitra</a>
          </nav>
          <Link to="/dashboard" className="investor-focus inline-flex min-h-11 items-center gap-2 rounded-full bg-djiwa-navy px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-djiwa-navy-soft active:scale-[.98] whitespace-nowrap sm:px-5 sm:text-[13px]">
            <LockKeyhole size={15} aria-hidden="true" /> <span>Ruang investor</span><ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section id="top" className="relative isolate overflow-hidden bg-djiwa-navy text-white">
        <div className="investor-grid absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="absolute -right-20 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-djiwa-gold/10 blur-[90px]" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16 lg:px-10 lg:py-24">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-djiwa-surface/[.06] px-3 py-1.5 text-[11px] font-semibold text-djiwa-inverse-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-djiwa-gold" /> Djiwa Tentram · Dialog untuk investor
            </div>
            <h1 className="investor-display max-w-[760px] text-[clamp(2.55rem,7vw,5.1rem)] font-semibold leading-[1.02] text-white">
              Temukan peluang pertumbuhan <span className="text-djiwa-gold-highlight">bersama Djiwa Tentram.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-djiwa-inverse-muted sm:text-[17px] sm:leading-8">
              Untuk investor individu yang ingin menilai ekspansi bisnis kuliner dengan dasar yang jelas: transaksi tercatat, kesiapan operasional, dan percakapan terbuka tentang kemitraan.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#data" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-djiwa-gold px-6 text-sm font-bold text-djiwa-navy shadow-lg shadow-djiwa-navy/10 transition hover:bg-djiwa-gold-highlight active:scale-[.98]">
                Lihat data aktual <ArrowRight size={17} aria-hidden="true" />
              </a>
              <Link to="/dashboard" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-djiwa-surface/[.08]">
                Ajukan diskusi <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-[11px] leading-5 text-djiwa-inverse-soft"><ShieldCheck size={14} className="shrink-0 text-djiwa-gold" /> Snapshot publik terbatas; laporan yang lebih rinci memerlukan persetujuan akses.</p>
          </div>

          <aside className="relative mx-auto w-full max-w-[520px] lg:ml-auto" aria-label="Cara menilai peluang ekspansi">
            <div className="rounded-[26px] border border-white/10 bg-djiwa-surface/[.06] p-4 shadow-2xl shadow-djiwa-navy/20 backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-djiwa-inverse-soft">Kerangka evaluasi</p><p className="mt-1 text-[16px] font-bold text-white">Tiga hal sebelum bertumbuh</p></div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-djiwa-gold/15 text-djiwa-gold-highlight"><Compass size={19} /></span>
              </div>
              <div className="space-y-3 pt-4">
                {[
                  ["01", "Permintaan pasar", "Mulai dari sinyal order yang benar-benar tercatat"],
                  ["02", "Kesiapan operasional", "Tinjau kapasitas, pasokan, dan unit economics"],
                  ["03", "Kemitraan yang selaras", "Bahas area, peran, dan struktur secara terbuka"],
                ].map(([number, title, description]) => (
                  <div key={number} className="flex gap-3 rounded-2xl border border-white/[.07] bg-djiwa-navy-deep/35 p-3.5 sm:p-4">
                    <span className="pt-0.5 text-[11px] font-bold tabular-nums text-djiwa-gold">{number}</span>
                    <div className="min-w-0"><p className="text-[13px] font-bold text-white">{title}</p><p className="mt-1 text-[11px] leading-5 text-djiwa-inverse-soft">{description}</p></div>
                    <Check className="ml-auto mt-0.5 shrink-0 text-djiwa-gold/80" size={15} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-djiwa-gold-highlight p-3.5 text-djiwa-navy sm:p-4">
                <TrendingUp size={19} className="shrink-0" aria-hidden="true" />
                <p className="text-[11px] font-semibold leading-5">Snapshot hanya mencakup satu kanal; laporan lebih luas dibuka setelah persetujuan.</p>
                <CircleDollarSign size={19} className="ml-auto shrink-0 opacity-70" aria-hidden="true" />
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-djiwa-inverse-muted">Informasi awal, bukan penawaran efek atau janji imbal hasil.</p>
          </aside>
        </div>
      </section>

      <section id="thesis" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-navy-soft">Mengapa berdialog dengan Djiwa Tentram</p><h2 className="investor-display mt-3 max-w-md text-3xl font-semibold leading-tight text-djiwa-ink sm:text-4xl">Lihat data lebih dulu. Bahas ekspansi dengan konteks.</h2></div>
          <p className="max-w-2xl text-[14px] leading-7 text-djiwa-muted sm:text-[15px]">Mulai dari sinyal transaksi yang tersedia, lalu dalami kesiapan operasi dan asumsi bersama tim. Setiap ringkasan menunjukkan sumber serta periode agar Anda dapat menilai apa yang tercakup—dan apa yang belum.</p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
          {[
            { icon: BarChart3, title: "Angka aktual, cakupan jujur", description: "Lihat metrik order beserta kanal dan periode yang benar-benar tercatat." },
            { icon: Building2, title: "Ekspansi dinilai bertahap", description: "Bahas permintaan, kesiapan operasional, dan asumsi lokasi sebelum menyusun langkah." },
            { icon: ShieldCheck, title: "Informasi tetap terjaga", description: "Data publik berbentuk agregat; laporan lebih luas hanya untuk investor yang disetujui." },
          ].map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="investor-panel p-5 sm:p-6">
              <div className={`grid h-10 w-10 place-items-center rounded-[14px] ${index === 1 ? "bg-djiwa-gold-soft text-djiwa-navy-soft" : "bg-djiwa-navy-mist text-djiwa-navy-soft"}`}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></div>
              <h3 className="mt-5 text-[15px] font-bold text-djiwa-navy">{title}</h3>
              <p className="mt-2 text-[12px] leading-6 text-djiwa-muted">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-8 sm:pb-18 lg:px-10" aria-labelledby="ecosystem-title">
        <div className="overflow-hidden rounded-[28px] bg-djiwa-navy text-white shadow-[0_22px_70px_rgba(18,36,58,.14)]">
          <div className="grid gap-0 lg:grid-cols-[.92fr_1.08fr] lg:items-stretch">
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
              <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-gold-highlight">Keunggulan sistem · dikembangkan internal</p><h2 id="ecosystem-title" className="investor-display mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Bukan sekadar aplikasi. Kami membangun sistem operasi digital sendiri.</h2><p className="mt-4 max-w-xl text-[13px] leading-6 text-djiwa-inverse-muted">Fondasi digital Djiwa Tentram kami kembangkan dan operasikan sendiri untuk menyatukan pelanggan, penjualan, stok, keuangan, tim, dan pengambilan keputusan. Bukan sekumpulan tools yang berdiri sendiri: setiap alur dirancang agar data lebih rapi, dapat ditelusuri, dan siap dikembangkan.</p></div>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {[{ value: "14", label: "aplikasi bisnis" }, { value: "1", label: "backend autentikasi" }, { value: "8", label: "layanan backend" }, { value: "30+", label: "view analitik" }].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[.06] p-3.5"><p className="text-xl font-bold tabular-nums text-djiwa-gold-highlight">{item.value}</p><p className="mt-1 text-[10px] text-djiwa-inverse-soft">{item.label}</p></div>)}
              </div>
            </div>
            <div className="relative min-h-[280px] overflow-hidden bg-djiwa-navy-deep/40"><img src="/images/investor/digital-ecosystem.webp" alt="Ilustrasi ekosistem digital Djiwa Tentram yang menghubungkan pelanggan, POS, inventori, keuangan, tim, AI, dan investor." loading="lazy" decoding="async" width={1280} height={853} className="h-full w-full object-cover opacity-90" /><div className="absolute inset-0 bg-gradient-to-r from-djiwa-navy via-transparent to-transparent lg:bg-gradient-to-r" /><span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-djiwa-navy/75 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-white backdrop-blur-sm">Ilustrasi sistem digital</span></div>
          </div>
          <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            {[{ icon: Network, title: "Aplikasi pelanggan & kanal", detail: "Customer, Merchandise, B2B, Booking, Linkbio, Yumme, 500 Kopi Tasik, Ordermie Yamin, dan brand storefront." }, { icon: Database, title: "POS, stok & produksi", detail: "POS, admin, resep, inventori, HPP, dan alur produksi." }, { icon: BarChart3, title: "Finance, AI & insight", detail: "Transaksi, akuntansi, analitik, forecasting, dan asisten AI." }, { icon: ShieldCheck, title: "People, akses & kontrol", detail: "Karyawan, rekrutmen, payroll, autentikasi, dan audit trail." }].map(({ icon: Icon, title, detail }) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-3.5"><Icon size={18} className="text-djiwa-gold-highlight" aria-hidden="true" /><h3 className="mt-3 text-[12px] font-bold text-white">{title}</h3><p className="mt-1 text-[10px] leading-5 text-djiwa-inverse-soft">{detail}</p></div>)}
          </div>
        </div>
      </section>

      <section id="data" className="border-y border-djiwa-line bg-djiwa-surface">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-navy-soft">Rekam jejak · seluruh sistem POS</p><h2 className="investor-display mt-3 text-3xl font-semibold leading-tight text-djiwa-ink sm:text-4xl">Skala sistem sejak data pertama.</h2><p className="mt-4 text-[13px] leading-6 text-djiwa-muted">Empat metrik utama di bawah merangkum seluruh order POS berstatus paid/completed sejak data pertama tercatat. Ini memberi gambaran skala operasional yang lebih utuh; performa kanal Djiwa Tentram tetap ditampilkan terpisah sebagai pembanding.</p><p className="mt-3 inline-flex rounded-full bg-djiwa-navy-mist px-3 py-1.5 text-[10px] font-bold text-djiwa-navy-soft">Indikator operasional · belum diaudit · diperbarui {snapshotLoading ? "…" : formatWibDate(snapshot?.ecosystemLastDateWib ?? null) ?? "—"}</p></div>
            <p className="max-w-2xl text-[13px] leading-6 text-djiwa-muted">Ringkasan metrik tersedia secara publik. Laporan keuangan dan rincian operasional lengkap tersedia melalui portal investor terproteksi setelah proses verifikasi.</p>
          </div>
          <div aria-live="polite" aria-busy={snapshotLoading} className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><SnapshotCard label="Pesanan dibayar & diselesaikan" value={snapshotLoading ? "Memuat…" : snapshot ? new Intl.NumberFormat("id-ID").format(snapshot.ecosystemSettledOrders ?? 0) : "Belum tersedia"} detail="Seluruh sistem POS · sejak data pertama" icon={<Check size={16} />} accent="navy" /><SnapshotCard label="Nilai transaksi bruto" value={snapshotLoading ? "Memuat…" : snapshot ? formatRupiah(snapshot.ecosystemOrderValue) : "Belum tersedia"} detail="Agregat seluruh POS; bukan pendapatan" icon={<CircleDollarSign size={17} />} accent="gold" /><SnapshotCard label="Rata-rata nilai per pesanan" value={snapshotLoading ? "Memuat…" : snapshot ? formatRupiah(snapshot.ecosystemAverageOrderValue) : "Belum tersedia"} detail="Dihitung dari seluruh POS selesai" icon={<BarChart3 size={16} />} accent="blue" /><SnapshotCard label="Periode sistem (WIB)" value={snapshot ? `${formatWibDate(snapshot.ecosystemFirstDateWib) ?? "—"} – ${formatWibDate(snapshot.ecosystemLastDateWib) ?? "—"}` : snapshotLoading ? "Memuat…" : "Belum tersedia"} detail="Sejak data pertama tercatat" icon={<Check size={16} />} accent="slate" /></div>
          <p className="mt-3 rounded-xl border border-djiwa-gold-border bg-djiwa-warning-soft px-3.5 py-3 text-[10px] leading-5 text-djiwa-warning-ink"><strong className="font-bold">Cakupan & status data:</strong> seluruh order POS dengan status paid/completed sejak data pertama tercatat, lintas kanal. Ini indikator operasional perusahaan yang belum diaudit—bukan pendapatan akuntansi, arus kas, laba, valuasi, proyeksi, atau imbal hasil. Pending dan cancelled dikecualikan. Sumber: database operasional perusahaan.</p>
          <div className="mt-5">
            <InvestmentCalculator />
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["Pemasukan & beban tercatat", "Ringkasan untuk investor yang disetujui, dengan periode dan definisi sumber."],
              ["Target dan progres", "Dibaca bersama periode pelaporan serta status kelengkapan."],
              ["Indikator operasional", "Agregat yang relevan untuk diskusi; tanpa identitas pelanggan atau staf."],
              ["Pembaruan dan cakupan", "Tanggal pembaruan, sumber, dan batas data ditampilkan bersama metrik."],
            ].map(([title, detail]) => <div key={title} className="rounded-2xl border border-djiwa-line bg-djiwa-surface-muted p-4"><div className="flex items-start gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-djiwa-gold/25 text-djiwa-navy-soft"><Check size={13} /></span><div><h3 className="text-[12px] font-bold text-djiwa-navy">{title}</h3><p className="mt-1 text-[11px] leading-5 text-djiwa-muted">{detail}</p></div></div></div>)}
          </div>
        </div>
      </section>

      <section id="process" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10">
        <div className="investor-panel relative overflow-hidden bg-djiwa-surface p-5 sm:p-8 lg:p-10">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-16 rounded-full bg-djiwa-gold/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-navy-soft">Langkah berikutnya</p><h2 className="investor-display mt-3 text-3xl font-semibold leading-tight text-djiwa-ink sm:text-4xl">Punya tesis investasi yang sejalan?</h2><p className="mt-3 text-[13px] leading-6 text-djiwa-muted">Ceritakan area dan pendekatan kemitraan yang ingin Anda bahas. Tim Djiwa Tentram akan meninjau permintaan dan menjelaskan informasi yang dapat dibagikan.</p></div>
            <Link to="/dashboard" className="investor-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-djiwa-navy px-6 text-sm font-bold text-white transition hover:bg-djiwa-navy-soft active:scale-[.98]">Ajukan diskusi investor <ArrowRight size={17} /></Link>
          </div>
          <div className="relative mt-8 grid gap-3 border-t border-djiwa-line pt-6 sm:grid-cols-3">
            {["Masuk dengan akun Google", "Ceritakan area dan minat", "Tim meninjau permintaan"].map((step, i) => <div className="flex items-start gap-3" key={step}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-djiwa-gold-border text-[11px] font-bold text-djiwa-navy-soft">{i + 1}</span><p className="pt-1 text-[11px] font-semibold leading-5 text-djiwa-muted">{step}</p></div>)}
          </div>
        </div>
      </section>

      <footer className="border-t border-djiwa-line bg-djiwa-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-[10px] leading-5 text-djiwa-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>© {new Date().getFullYear()} Djiwa Tentram · Investor Relations</p>
          <div className="flex flex-col gap-2 sm:items-end"><Link to="/privacy" className="investor-focus min-h-8 rounded-md font-semibold underline underline-offset-2">Pemberitahuan privasi</Link><p className="max-w-2xl sm:text-right">Informasi untuk diskusi awal, bukan rekomendasi investasi atau penawaran efek. Semua peluang, asumsi, dan ketentuan investasi memerlukan verifikasi serta persetujuan tertulis.</p></div>
        </div>
      </footer>
    </main>
  );
}

function SnapshotCard({ label, value, detail, icon, accent = "navy" }: { label: string; value: string; detail: string; icon: ReactNode; accent?: "navy" | "gold" | "blue" | "slate" }) {
  const accentStyles = { navy: "border-t-djiwa-navy", gold: "border-t-djiwa-gold", blue: "border-t-sky-600", slate: "border-t-slate-400" };
  return <article className={`investor-panel min-w-0 border-t-4 p-4 sm:p-5 ${accentStyles[accent]}`}>
    <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold text-djiwa-muted">{label}</p><span className="shrink-0 text-djiwa-navy-soft" aria-hidden="true">{icon}</span></div>
    <p className="mt-3 break-words text-[clamp(1.05rem,2.6vw,1.55rem)] font-bold tabular-nums tracking-tight text-djiwa-ink">{value}</p>
    <p className="mt-2 text-[10px] leading-4 text-djiwa-muted">{detail}</p>
  </article>;
}
