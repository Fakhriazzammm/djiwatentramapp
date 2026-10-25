import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Building2, CheckCircle2, Clock3, LockKeyhole, LogOut, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { investorAuth } from "@/lib/auth-client";
import { AnimatedMetric } from "@yumipos/web-shared/components/ui/animated-metric";

export const Route = createFileRoute("/dashboard")({ component: InvestorDashboard });

type AccessState = "none" | "pending" | "approved" | "suspended" | "unavailable";
type InvestorMetrics = {
  periodLabel: string;
  asOf: string;
  metrics: {
    currentIncome: number | null;
    currentExpense: number | null;
    currentNet: number | null;
    targetRevenue: number | null;
    progressPct: number | null;
  };
  source: string;
  completeness: "available" | "partial" | "unavailable";
};

const API_BASE = import.meta.env.VITE_INVESTOR_API_URL?.trim() || "https://api.djiwatentram.web.id";

function formatRupiah(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Belum tersedia";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
function safeDate(value?: string) {
  if (!value) return "Waktu pembaruan belum tersedia";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu pembaruan belum tersedia" : `Diperbarui ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date)} WIB`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Sesi investor berakhir. Silakan masuk kembali." : `Permintaan belum berhasil (${response.status}).`);
  return response.json() as Promise<T>;
}

function InvestorDashboard() {
  const { data: session, isPending: sessionLoading } = investorAuth.useSession();
  const [access, setAccess] = useState<AccessState>("unavailable");
  const [accessLoading, setAccessLoading] = useState(true);
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [cityInterest, setCityInterest] = useState("");
  const [interestRange, setInterestRange] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = useMemo(() => session?.user?.name?.trim().split(/\s+/)[0] || "Investor", [session?.user?.name]);

  useEffect(() => {
    if (!session?.user) { setAccess("none"); setMetrics(null); setAccessLoading(false); return; }
    let active = true;
    setAccessLoading(true);
    setError(null);
    request<{ status: AccessState }>("/v1/investor/access")
      .then((result) => { if (active) setAccess(result.status); })
      .catch((err) => { if (active) { setAccess("unavailable"); setError(err instanceof Error ? err.message : "Status akses belum dapat dimuat."); } })
      .finally(() => { if (active) setAccessLoading(false); });
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (access !== "approved") { setMetrics(null); return; }
    let active = true;
    setMetricsLoading(true);
    setError(null);
    request<{ data: InvestorMetrics }>("/v1/investor/metrics")
      .then((result) => { if (active) setMetrics(result.data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Data belum dapat dimuat."); })
      .finally(() => { if (active) setMetricsLoading(false); });
    const refreshTimer = window.setInterval(() => setMetricsRefreshKey((value) => value + 1), 60_000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, [access, metricsRefreshKey]);

  const signInGoogle = async () => {
    try {
      const callbackURL = `${window.location.origin}/dashboard`;
      await investorAuth.signIn.social({ provider: "google", callbackURL });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Google sign-in belum tersedia."); }
  };

  const submitAccessRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consent) { toast.error("Mohon setujui penggunaan data untuk menindaklanjuti permintaan."); return; }
    setRequesting(true); setError(null);
    try {
      await request("/v1/investor/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityInterest.trim() || null, investmentRange: interestRange.trim() || null, consent: true, consentVersion: "investor-portal-v1" }),
      });
      setAccess("pending");
      toast.success("Permintaan terkirim. Tim kami akan meninjaunya.");
    } catch (err) { setError(err instanceof Error ? err.message : "Permintaan belum berhasil dikirim."); }
    finally { setRequesting(false); }
  };

  const signOut = async () => {
    try { await investorAuth.signOut(); setAccess("none"); setMetrics(null); }
    catch { toast.error("Belum berhasil keluar. Coba lagi."); }
  };

  if (sessionLoading || (session?.user && accessLoading)) return <LoadingScreen />;

  return (
    <main className="investor-page min-h-screen bg-djiwa-canvas px-4 pb-10 pt-[max(env(safe-area-inset-top),1rem)] sm:px-7 sm:pt-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="investor-focus inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[12px] font-semibold text-djiwa-muted hover:text-djiwa-navy"><ArrowLeft size={16} /> Kembali ke halaman investor</Link>
          {session?.user && <button type="button" onClick={signOut} className="investor-focus inline-flex min-h-11 items-center gap-2 rounded-full border border-djiwa-line bg-djiwa-surface px-4 text-[12px] font-semibold text-djiwa-muted hover:text-djiwa-navy"><LogOut size={15} /> Keluar</button>}
        </header>

        {!session?.user ? (
          <section className="mx-auto mt-10 max-w-xl rounded-[26px] border border-djiwa-line bg-djiwa-surface p-6 shadow-[0_18px_60px_rgba(18,36,58,.08)] sm:mt-16 sm:p-9">
            <BrandMark />
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[.18em] text-djiwa-gold-deep">Ruang data investor</p>
            <h1 className="investor-display mt-2 text-3xl font-semibold leading-tight text-djiwa-ink sm:text-[38px]">Lihat lebih jauh dari snapshot publik.</h1>
            <p className="mt-3 max-w-md text-[13px] leading-6 text-djiwa-muted">Masuk dengan Google untuk mengajukan diskusi. Setelah tim meninjau dan menyetujui akses, ringkasan yang tersedia untuk investor akan muncul di sini.</p>
            <button onClick={signInGoogle} className="investor-focus mt-7 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-djiwa-navy px-5 text-sm font-bold text-white transition hover:bg-djiwa-navy-soft active:scale-[.99]">
              <GoogleGlyph /> Masuk dengan Google
            </button>
            <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-djiwa-muted"><LockKeyhole size={13} className="mt-0.5 shrink-0" /> Masuk hanya memverifikasi akun; akses laporan tetap memerlukan persetujuan.</p>
            <p className="mt-5 border-t border-djiwa-line pt-4 text-[10px] leading-5 text-djiwa-muted">Dengan melanjutkan, Anda menyetujui pemrosesan minimum data akun untuk autentikasi dan keamanan sesi. <Link to="/privacy" className="font-semibold underline underline-offset-2">Lihat pemberitahuan privasi.</Link></p>
          </section>
        ) : access === "approved" ? (
          <section className="mt-7 space-y-5">
            <div className="flex flex-col justify-between gap-4 rounded-[24px] bg-djiwa-navy p-5 text-white sm:flex-row sm:items-end sm:p-7">
              <div><p className="text-[11px] font-semibold uppercase tracking-[.17em] text-djiwa-gold-highlight">Ruang data investor</p><h1 className="investor-display mt-2 text-3xl font-semibold">Selamat datang, {displayName}</h1><p className="mt-2 text-[12px] text-djiwa-inverse-muted">Ringkasan operasional yang disetujui untuk akun Anda, lengkap dengan periode dan sumber data.</p></div>
              <div className="flex items-center gap-2 text-[11px] text-djiwa-inverse-muted"><span className="h-2 w-2 rounded-full bg-djiwa-success" /> Akses disetujui · data agregat</div>
            </div>
            {error && <InlineError message={error} onRetry={() => setMetricsRefreshKey((value) => value + 1)} />}
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Pemasukan tercatat" value={metricsLoading ? null : metrics?.metrics.currentIncome} loading={metricsLoading} icon={<BarChart3 size={16} />} />
              <MetricCard label="Beban tercatat" value={metricsLoading ? null : metrics?.metrics.currentExpense} loading={metricsLoading} icon={<Building2 size={16} />} />
              <MetricCard label="Selisih pemasukan–beban" value={metricsLoading ? null : metrics?.metrics.currentNet} loading={metricsLoading} icon={<CheckCircle2 size={16} />} />
            </div>
            <section className="investor-panel border-djiwa-navy/10 bg-djiwa-navy p-5 text-white sm:p-6" aria-labelledby="city-expansion-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-djiwa-gold-highlight">Peluang pertumbuhan · ruang diskusi</p><h2 id="city-expansion-title" className="investor-display mt-2 text-2xl font-semibold sm:text-3xl">Membangun pijakan di kota berikutnya.</h2><p className="mt-2 max-w-2xl text-[12px] leading-6 text-djiwa-inverse-muted">Materi ini membantu investor menilai arah ekspansi, kesiapan sistem, dan kebutuhan modal tanpa mencampurkan indikator operasional dengan penawaran saham.</p></div><Building2 className="shrink-0 text-djiwa-gold-highlight" size={21} aria-hidden="true" /></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[{ title: "Tesis kota", detail: "Validasi permintaan lokal, kesiapan operasi, dan urutan pembukaan kota." }, { title: "Penggunaan dana", detail: "Persiapan outlet, tim, working capital, dan penguatan sistem digital." }, { title: "Struktur investasi", detail: "Valuasi, instrumen, porsi saham, hak investor, dan minimum investasi menunggu term sheet final." }].map((item) => <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><h3 className="text-[12px] font-bold text-white">{item.title}</h3><p className="mt-1.5 text-[10px] leading-5 text-djiwa-inverse-soft">{item.detail}</p></div>)}
              </div>
              <p className="mt-4 rounded-xl border border-djiwa-gold-border/40 bg-djiwa-gold/10 px-3.5 py-3 text-[10px] leading-5 text-djiwa-gold-highlight">DRAFT UNTUK DISKUSI · Bukan penawaran efek. Pembagian saham dan ketentuan investasi hanya berlaku setelah valuasi, struktur hukum, persetujuan pemegang saham, dan dokumen legal final disetujui.</p>
            </section>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
              <section className="investor-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-bold text-djiwa-navy">Periode pelaporan</h2><p className="mt-1 text-[11px] text-djiwa-muted">{metrics?.periodLabel || "Periode belum tersedia"}</p></div><button onClick={() => setMetricsRefreshKey((value) => value + 1)} className="investor-focus inline-flex min-h-9 items-center gap-2 rounded-lg border border-djiwa-line px-3 text-[11px] font-semibold text-djiwa-muted"><RefreshCw size={13} /> Perbarui data</button></div>
                <div className="mt-5 rounded-2xl border border-dashed border-djiwa-line-strong bg-djiwa-surface-muted px-4 py-8 text-center">
                  {metricsLoading ? <><span className="mx-auto block h-4 w-32 animate-pulse rounded bg-djiwa-line" /><span className="mx-auto mt-3 block h-3 w-48 animate-pulse rounded bg-djiwa-line/50" /></> : metrics?.metrics.targetRevenue != null ? <><p className="text-[11px] font-semibold text-djiwa-muted">Target internal periode ini</p><p className="mt-2 text-2xl font-bold tabular-nums text-djiwa-ink">{formatRupiah(metrics.metrics.targetRevenue)}</p>{metrics.metrics.progressPct != null && <p className="mt-2 text-xs font-semibold text-djiwa-gold-deep">{metrics.metrics.progressPct.toFixed(1)}% dari target tercatat</p>}</> : <p className="text-[12px] text-djiwa-muted">Target belum tersedia untuk periode ini.</p>}
                </div>
                <p className="mt-3 text-[10px] leading-5 text-djiwa-muted">{safeDate(metrics?.asOf)} · Sumber: {metrics?.source || "Belum tersedia"}. Ini ringkasan operasional internal; bukan laporan audit, laba bersih, proyeksi, atau imbal hasil investasi.</p>
              </section>
              <aside className="investor-panel p-5 sm:p-6">
                <div className="flex items-center gap-2 text-djiwa-gold-deep"><ShieldCheck size={17} /><h2 className="text-[13px] font-bold text-djiwa-navy">Cara membaca angka</h2></div>
                <p className="mt-3 text-[11px] leading-5 text-djiwa-muted">Pemasukan, beban, dan selisih mengikuti agregat sumber internal dalam WIB. Tinjau definisi, kategori, cakupan, dan kelengkapan sebelum menggunakannya dalam due diligence atau keputusan investasi.</p>
                <div className="mt-4 rounded-xl bg-djiwa-gold-soft p-3 text-[10px] leading-5 text-djiwa-warning-ink">Kelengkapan data: {metrics?.completeness === "available" ? "tersedia" : metrics?.completeness === "partial" ? "parsial" : "belum tersedia"}. Cocokkan dengan dokumen resmi dan tim Djiwa Tentram.</div>
              </aside>
            </div>
          </section>
        ) : access === "pending" ? (
          <section className="mx-auto mt-10 max-w-xl rounded-[26px] border border-djiwa-line bg-djiwa-surface p-6 shadow-sm sm:mt-16 sm:p-9"><BrandMark /><div className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-djiwa-warning-soft text-djiwa-warning"><Clock3 size={22} /></div><p className="mt-5 text-[11px] font-bold uppercase tracking-[.17em] text-djiwa-gold-deep">Permintaan diterima</p><h1 className="investor-display mt-2 text-3xl font-semibold text-djiwa-ink">Minat investasi Anda sudah tercatat.</h1><p className="mt-3 text-[13px] leading-6 text-djiwa-muted">Tim Djiwa Tentram akan meninjau permintaan Anda. Jika disetujui, ringkasan dan materi yang diizinkan akan tersedia di ruang ini. Login Google tidak otomatis membuka data privat.</p><button onClick={() => window.location.reload()} className="investor-focus mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-djiwa-line px-4 text-[12px] font-semibold text-djiwa-muted"><RefreshCw size={14} /> Periksa status</button></section>
        ) : access === "suspended" ? (
          <section className="mx-auto mt-12 max-w-xl rounded-[26px] border border-djiwa-line bg-djiwa-surface p-7 text-center"><TriangleAlert className="mx-auto text-djiwa-warning" size={28} /><h1 className="investor-display mt-4 text-2xl font-semibold text-djiwa-navy">Akses perlu ditinjau</h1><p className="mt-2 text-sm leading-6 text-djiwa-muted">Akses untuk akun ini belum tersedia. Jika menurut Anda ada kekeliruan, hubungi tim Djiwa Tentram melalui kanal resmi.</p></section>
        ) : session?.user ? (
          <section className="mx-auto mt-10 max-w-xl rounded-[26px] border border-djiwa-line bg-djiwa-surface p-6 shadow-sm sm:mt-16 sm:p-9"><BrandMark /><div className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-djiwa-navy-mist text-djiwa-navy-soft"><LockKeyhole size={21} /></div><p className="mt-5 text-[11px] font-bold uppercase tracking-[.17em] text-djiwa-gold-deep">Mulai diskusi</p><h1 className="investor-display mt-2 text-3xl font-semibold text-djiwa-ink">Ceritakan rencana yang ingin Anda jajaki.</h1><p className="mt-3 text-[13px] leading-6 text-djiwa-muted">Bagikan area dan pendekatan investasi yang ingin dibahas. Informasi ini membantu tim menyiapkan percakapan yang relevan; kolomnya opsional.</p>
            <form className="mt-6 space-y-4" onSubmit={submitAccessRequest}>
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-djiwa-muted">Kota atau area yang ingin dibahas <span className="font-normal text-djiwa-muted">(opsional)</span></span><input value={cityInterest} onChange={(e) => setCityInterest(e.target.value)} maxLength={100} className="investor-focus min-h-11 w-full rounded-xl border border-djiwa-line bg-djiwa-surface px-3 text-sm outline-none focus:border-djiwa-gold-deep" placeholder="Contoh: kota yang Anda minati" /></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-djiwa-muted">Pendekatan atau kisaran investasi <span className="font-normal text-djiwa-muted">(opsional)</span></span><input value={interestRange} onChange={(e) => setInterestRange(e.target.value)} maxLength={80} className="investor-focus min-h-11 w-full rounded-xl border border-djiwa-line bg-djiwa-surface px-3 text-sm outline-none focus:border-djiwa-gold-deep" placeholder="Bisa dibahas saat percakapan" /></label>
              <label className="flex items-start gap-2.5 text-[10px] leading-5 text-djiwa-muted"><input checked={consent} onChange={(e) => setConsent(e.target.checked)} type="checkbox" required className="mt-1 h-4 w-4 accent-djiwa-gold-deep" /><span>Saya setuju tim Djiwa Tentram memakai data akun Google dan jawaban opsional saya untuk meninjau minat serta menindaklanjuti diskusi investasi.</span></label>
              {error && <InlineError message={error} />}
              <button disabled={requesting} className="investor-focus inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-djiwa-navy px-4 text-sm font-bold text-white transition hover:bg-djiwa-navy-soft disabled:cursor-wait disabled:opacity-60">{requesting ? "Mengirim…" : "Ajukan diskusi investor"}<ArrowRight size={16} /></button>
              <p className="text-center text-[10px] leading-5 text-djiwa-muted">Pengajuan ini belum menjadi komitmen investasi dan tidak otomatis membuka akses data.</p>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function BrandMark() { return <Link to="/" className="investor-focus inline-flex items-center gap-3 rounded-xl"><img src="/logo-djiwa.png" alt="" aria-hidden="true" className="h-10 w-10 rounded-[14px] object-contain" /><span><b className="block text-[13px] text-djiwa-navy">Djiwa Tentram</b><small className="text-[10px] font-semibold uppercase tracking-[.15em] text-djiwa-muted">Investor Relations</small></span></Link>; }
function GoogleGlyph() { return <svg viewBox="0 0 48 48" aria-hidden="true" className="h-[18px] w-[18px]"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.9c-.57 2.95-2.25 5.45-4.76 7.13l7.73 6C44.38 37.98 46.98 31.8 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.85l-7.73-6c-2.14 1.43-4.9 2.27-8.17 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>; }
function LoadingScreen() { return <main className="grid min-h-screen place-items-center bg-djiwa-canvas p-5"><div className="w-full max-w-lg animate-pulse rounded-[26px] border border-djiwa-line bg-djiwa-surface p-8"><div className="h-10 w-10 rounded-[14px] bg-djiwa-line"/><div className="mt-8 h-4 w-32 rounded bg-djiwa-line"/><div className="mt-3 h-9 w-3/4 rounded bg-djiwa-line"/><div className="mt-3 h-4 w-full rounded bg-djiwa-line/50"/></div></main>; }
function MetricCard({ label, value, loading, icon }: { label: string; value: number | null | undefined; loading: boolean; icon: ReactNode }) { return <article className="investor-panel p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-djiwa-muted">{label}</p><span className="text-djiwa-gold-deep">{icon}</span></div>{loading ? <div className="mt-4 h-7 w-36 animate-pulse rounded bg-djiwa-line/50" /> : <p className="mt-3 text-[clamp(1.1rem,3vw,1.65rem)] font-bold tabular-nums tracking-tight text-djiwa-ink"><AnimatedMetric value={value} /></p>}<p className="mt-2 text-[10px] text-djiwa-muted">Data agregat · database VPS</p></article>; }
function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-djiwa-danger/25 bg-djiwa-danger-soft p-3 text-[11px] leading-5 text-djiwa-danger"><span>{message}</span>{onRetry && <button onClick={onRetry} className="shrink-0 font-semibold underline">Coba lagi</button>}</div>; }
