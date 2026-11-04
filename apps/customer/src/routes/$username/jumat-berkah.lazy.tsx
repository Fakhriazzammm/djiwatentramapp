import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, HeartHandshake, Loader2, Minus, Plus, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { JumatBerkahGallery, prayerMeta } from "@/components/customer/jumat-berkah";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useJumatBerkah } from "@/hooks/use-jumat-berkah";
import {
  createJumatBerkahDonation, fetchJumatBerkahDonationStatus, toggleJumatBerkahAmin, type DonationStatus,
} from "@/lib/jumat-berkah-api";
import {
  displayDonorName, donationAmount, formatCountdown, formatDistributionDate, formatRupiah, PORTION_PRESETS, PRAYER_MAX_LENGTH,
  PRAYER_SUGGESTIONS, progressPercent, validatePortions, validatePrayer, type JumatBerkahOverview,
} from "@/lib/jumat-berkah-logic";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/$username/jumat-berkah")({ component: JumatBerkahPage });

type Enabled = Extract<JumatBerkahOverview, { enabled: true }>;
const CARD = "rounded-[24px] bg-card shadow-[0_1px_2px_rgba(20,32,63,0.06),0_8px_24px_rgba(20,32,63,0.06)]";
const INTENT_KEY = "djiwa.jumatBerkah.intent";

function rememberIntent() {
  try { window.sessionStorage.setItem(INTENT_KEY, "1"); } catch { /* mode privat */ }
}

function JumatBerkahPage() {
  const { username } = Route.useParams();
  const { step, d } = Route.useSearch();
  const navigate = useNavigate();
  const goHome = useCallback(() => navigate({ to: "/$username", params: { username } }), [navigate, username]);
  const goProgram = useCallback(() => navigate({ to: "/$username/jumat-berkah", params: { username }, search: {} }), [navigate, username]);
  const goForm = useCallback(() => navigate({ to: "/$username/jumat-berkah", params: { username }, search: { step: "sedekah" } }), [navigate, username]);
  const jb = useJumatBerkah();
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();

  const header = (
    <CustomerHeader
      title="Jumat Berkah"
      subtitle="Sedekah makanan setiap Jumat"
      onBack={step ? goProgram : goHome}
      leading={<ArrowLeft className="h-4 w-4" />}
    />
  );

  if (jb.state === "loading" && !jb.overview) {
    return <main className="app-page min-h-app bg-background">{header}<div className="px-3 pt-4"><CustomerSectionSkeleton label="Memuat Jumat Berkah" /></div></main>;
  }
  if (!jb.overview || jb.state === "error") {
    return <main className="app-page min-h-app bg-background">{header}<div className="px-3 pt-4"><CustomerErrorState message="Jumat Berkah belum dapat dimuat. Periksa koneksi lalu coba lagi." onRetry={() => jb.reload(true)} /></div></main>;
  }
  if (!jb.overview.enabled) {
    return <main className="app-page min-h-app bg-background">{header}<div className="px-3 pt-4"><div className={cn(CARD, "p-6 text-center")}><p className="font-display text-lg font-black">Segera hadir</p><p className="mt-1 text-sm text-muted-foreground">Program Jumat Berkah sedang disiapkan. Nantikan setiap Jumat.</p></div></div></main>;
  }
  const overview = jb.overview;

  if (step === "selesai" && d) {
    return <main className="app-page min-h-app bg-background">{header}<DonePage donationId={d} onProgram={goProgram} onHome={goHome} onRetryForm={goForm} /></main>;
  }
  if (step === "sedekah") {
    if (authLoading) return <main className="app-page min-h-app bg-background">{header}<div className="px-3 pt-4"><CustomerSectionSkeleton label="Menyiapkan formulir" /></div></main>;
    if (!isAuthenticated || !customer) {
      return (
        <main className="app-page min-h-app bg-background">
          {header}
          <div className="px-3 pt-4"><div className={cn(CARD, "p-6 text-center")}>
            <p className="font-display text-lg font-black">Masuk dulu untuk bersedekah</p>
            <p className="mt-1 text-sm text-muted-foreground">Kami perlu akunmu untuk kuitansi, doa, dan laporan pembagian.</p>
            <button type="button" onClick={() => { rememberIntent(); navigate({ to: "/masuk", search: { next: "jumat-berkah" } as never }); }} className="mt-4 min-h-12 w-full rounded-full bg-[#0F6B58] text-sm font-extrabold text-white">Masuk atau daftar</button>
          </div></div>
        </main>
      );
    }
    return <main className="app-page min-h-app bg-background pb-32">{header}<DonateForm overview={overview} username={username} fullName={customer.name ?? ""} sourceId={customer.sourceId} email={customer.email ?? ""} /></main>;
  }

  return <main className="app-page min-h-app bg-background pb-32">{header}<ProgramView overview={overview} authed={isAuthenticated && Boolean(customer)} sourceId={customer?.sourceId ?? ""} email={customer?.email ?? ""} onPatch={jb.patchPrayer} onDonate={goForm} /></main>;
}

// ───────────────────────── program ─────────────────────────

function ProgramView({ overview, authed, sourceId, email, onPatch, onDonate }: {
  overview: Enabled; authed: boolean; sourceId: string; email: string;
  onPatch: (id: string, patch: { aminCount?: number; aminByMe?: boolean }) => void; onDonate: () => void;
}) {
  const { campaign } = overview;
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  const percent = progressPercent(campaign.paidPortions, campaign.targetPortions);
  const closed = campaign.remainingPortions <= 0 || Date.parse(campaign.closesAt) <= now;

  const onAmin = async (prayerId: string, current: { aminCount: number; aminByMe: boolean }) => {
    if (!authed) { toast.message("Masuk untuk memberi Aamiin."); rememberIntent(); navigate({ to: "/masuk" }); return; }
    onPatch(prayerId, { aminByMe: !current.aminByMe, aminCount: current.aminCount + (current.aminByMe ? -1 : 1) });
    try {
      const result = await toggleJumatBerkahAmin({ sourceId, email, prayerId });
      onPatch(prayerId, { aminByMe: result.aminByMe, aminCount: result.aminCount });
    } catch {
      onPatch(prayerId, current);
      toast.error("Aamiin belum tersimpan. Coba lagi.");
    }
  };

  return (
    <div className="space-y-4 px-3 pt-4">
      <section className="rounded-[26px] bg-gradient-to-br from-[#0F5C4D] to-[#14796A] p-5 text-white shadow-[0_8px_24px_rgba(15,92,77,0.28)]" aria-label="Tentang program">
        <div className="flex items-center gap-2"><HeartHandshake className="h-5 w-5 text-[#F3D58A]" aria-hidden="true" /><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#F3D58A]">Dibagikan {formatDistributionDate(campaign.distributionDate)}</p></div>
        <h2 className="mt-2 font-display text-2xl font-black leading-tight">Satu porsi, satu senyum.</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-50/90">Sedekahkan makanan Djiwa Tentram seharga Happy Hour {formatRupiah(campaign.pricePerPortion)} per porsi. Kamu cukup membayar, tim kami memasak dan membagikannya langsung.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Tukang becak", "Pedagang kecil", "Pengamen", "Fakir miskin & dhuafa"].map((label) => <span key={label} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">{label}</span>)}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Porsi terkumpul"><div className="h-full rounded-full bg-[#F3D58A] transition-[width] duration-500" style={{ width: `${percent}%` }} /></div>
        <div className="mt-2 flex justify-between text-[12px] text-emerald-50/90"><span>{campaign.paidPortions} dari {campaign.targetPortions} porsi · {campaign.donors} donatur</span><span>{closed ? "Ditutup" : formatCountdown(campaign.closesAt, now)}</span></div>
      </section>

      <section className={cn(CARD, "p-4")} aria-label="Cara kerja">
        <h2 className="font-display text-[17px] font-black">Bagaimana alurnya?</h2>
        <ol className="mt-2 space-y-2 text-sm leading-snug text-foreground">
          <li><b>1.</b> Pilih jumlah porsi, tulis nama atau Hamba Allah, dan doamu.</li>
          <li><b>2.</b> Bayar lewat Mayar (QRIS, Virtual Account, e-wallet).</li>
          <li><b>3.</b> Jumat siang makanan dibagikan. Foto dan laporan masuk ke notifikasimu.</li>
        </ol>
        {overview.totalPortionsAllTime > 0 ? <p className="mt-3 text-xs text-muted-foreground">Sejak awal sudah {overview.totalPortionsAllTime.toLocaleString("id-ID")} porsi tersalurkan berkat kalian.</p> : null}
      </section>

      {overview.lastReport ? (
        <section className={cn(CARD, "p-4")} aria-label="Laporan terakhir">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-700">Laporan terakhir</p>
          <p className="mt-1 text-sm font-bold">{overview.lastReport.portionsGiven} porsi dibagikan · {formatDistributionDate(overview.lastReport.distributionDate)}</p>
          {overview.lastReport.location ? <p className="text-xs text-muted-foreground">{overview.lastReport.location}</p> : null}
          {overview.lastReport.notes ? <p className="mt-1 text-sm">{overview.lastReport.notes}</p> : null}
        </section>
      ) : null}

      <JumatBerkahGallery photos={overview.gallery} className="px-0" />

      {overview.mine.length > 0 ? (
        <section className={cn(CARD, "p-4")} aria-label="Sedekahmu">
          <h2 className="font-display text-[17px] font-black">Sedekahmu</h2>
          <ul className="mt-2 divide-y divide-border/60 text-sm">
            {overview.mine.map((item) => <li key={item.donationId} className="flex justify-between py-2"><span>{item.portions} porsi · {formatDistributionDate(item.distributionDate)}</span><b>{formatRupiah(item.amount)}</b></li>)}
          </ul>
        </section>
      ) : null}

      <section aria-label="Doa para donatur">
        <h2 className="px-1 font-display text-[19px] font-black leading-tight">Doa para donatur</h2>
        <ul className="mt-3 space-y-2.5">
          {overview.prayers.map((prayer) => (
            <li key={prayer.prayerId} className={cn(CARD, "p-4")}>
              <p className="text-[15px] leading-relaxed">“{prayer.body}”</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{prayerMeta(prayer)}</span>
                <button type="button" onClick={() => void onAmin(prayer.prayerId, { aminCount: prayer.aminCount, aminByMe: prayer.aminByMe })} aria-pressed={prayer.aminByMe} className={cn("min-h-10 rounded-full border px-4 text-[13px] font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50", prayer.aminByMe ? "border-[#0F6B58] bg-[#0F6B58] text-white" : "border-[#0F6B58] bg-card text-[#0F6B58]")}>Aamiin · {prayer.aminCount}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-5 pt-6">
        <button type="button" onClick={onDonate} disabled={closed} className="min-h-14 w-full rounded-full bg-[#0F6B58] text-base font-extrabold text-white shadow-lg transition active:scale-[.98] disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60">
          {closed ? "Pesanan Jumat ini sudah ditutup" : `Sedekah mulai ${formatRupiah(campaign.pricePerPortion)}`}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── form ─────────────────────────

function DonateForm({ overview, username, fullName, sourceId, email }: { overview: Enabled; username: string; fullName: string; sourceId: string; email: string }) {
  const { campaign, maxPortionsPerDonation } = overview;
  const [portions, setPortions] = useState(5);
  const [showName, setShowName] = useState(true);
  const [prayer, setPrayer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(crypto.randomUUID());
  useEffect(() => { keyRef.current = crypto.randomUUID(); }, [portions, showName, prayer]);

  const amount = donationAmount(portions, campaign.pricePerPortion);
  const portionCheck = validatePortions(portions, maxPortionsPerDonation, campaign.remainingPortions);
  const prayerCheck = validatePrayer(prayer);
  const shownName = useMemo(() => displayDonorName(showName, fullName), [showName, fullName]);
  const canSubmit = portionCheck.ok && prayerCheck.ok && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const donation = await createJumatBerkahDonation({
        sourceId, email, portions, showName, prayer: prayerCheck.text, idempotencyKey: keyRef.current,
        returnUrl: `${window.location.origin}/${encodeURIComponent(username)}/jumat-berkah?step=selesai`,
      });
      window.location.assign(donation.invoiceUrl);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyiapkan pembayaran.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 px-3 pt-4">
      <section className={cn(CARD, "p-4")} aria-labelledby="jb-portions">
        <h2 id="jb-portions" className="font-display text-[17px] font-black">Berapa porsi?</h2>
        <p className="text-xs text-muted-foreground">{formatRupiah(campaign.pricePerPortion)} per porsi · tersisa {campaign.remainingPortions} porsi</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PORTION_PRESETS.map((n) => <button key={n} type="button" onClick={() => setPortions(n)} aria-pressed={portions === n} className={cn("min-h-11 flex-1 rounded-2xl border text-sm font-bold", portions === n ? "border-[#0F6B58] bg-[#0F6B58] text-white" : "border-border bg-card")}>{n}</button>)}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Jumlah lain</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Kurangi porsi" onClick={() => setPortions((v) => Math.max(1, v - 1))} className="flex h-11 w-11 items-center justify-center rounded-full border border-border"><Minus className="h-4 w-4" /></button>
            <span className="min-w-8 text-center font-display text-xl font-black" aria-live="polite">{portions}</span>
            <button type="button" aria-label="Tambah porsi" onClick={() => setPortions((v) => Math.min(maxPortionsPerDonation, v + 1))} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0F6B58] text-white"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        {!portionCheck.ok ? <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{portionCheck.message}</p> : null}
      </section>

      <section className={cn(CARD, "p-4")} aria-labelledby="jb-name">
        <h2 id="jb-name" className="font-display text-[17px] font-black">Tampil sebagai</h2>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setShowName(true)} aria-pressed={showName} className={cn("min-h-11 flex-1 rounded-2xl border text-sm font-bold", showName ? "border-[#0F6B58] bg-[#0F6B58] text-white" : "border-border bg-card")}>{displayDonorName(true, fullName)}</button>
          <button type="button" onClick={() => setShowName(false)} aria-pressed={!showName} className={cn("min-h-11 flex-1 rounded-2xl border text-sm font-bold", !showName ? "border-[#0F6B58] bg-[#0F6B58] text-white" : "border-border bg-card")}>Hamba Allah</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Nama aslimu hanya diketahui tim Djiwa Tentram untuk kuitansi.</p>
      </section>

      <section className={cn(CARD, "p-4")} aria-labelledby="jb-prayer">
        <h2 id="jb-prayer" className="font-display text-[17px] font-black">Doa (opsional)</h2>
        <textarea
          value={prayer}
          onChange={(event) => setPrayer(event.target.value.slice(0, PRAYER_MAX_LENGTH + 20))}
          rows={3}
          maxLength={PRAYER_MAX_LENGTH + 20}
          placeholder="Tulis doa singkat. Akan tampil di halaman Jumat Berkah."
          className="mt-2 w-full resize-none rounded-2xl border border-border bg-background p-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          aria-describedby="jb-prayer-count"
        />
        <div id="jb-prayer-count" className={cn("mt-1 text-right text-[11px]", prayerCheck.ok ? "text-muted-foreground" : "font-bold text-destructive")}>{prayerCheck.text.length}/{PRAYER_MAX_LENGTH}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PRAYER_SUGGESTIONS.map((text) => <button key={text} type="button" onClick={() => setPrayer(text)} className="min-h-9 rounded-full border border-border bg-background px-3 text-xs">{text}</button>)}
        </div>
        {prayerCheck.ok && prayerCheck.text ? <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">“{prayerCheck.text}” — {shownName}</p> : null}
      </section>

      <section className={cn(CARD, "flex items-center justify-between p-4 text-sm")}>
        <span className="text-muted-foreground">{portions} × {formatRupiah(campaign.pricePerPortion)}</span>
        <b className="font-display text-lg">{formatRupiah(amount)}</b>
      </section>
      {error ? <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-5 pt-6">
        <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0F6B58] text-base font-extrabold text-white shadow-lg transition active:scale-[.98] disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60">
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Menyiapkan pembayaran…</> : `Bayar ${formatRupiah(amount)} dengan Mayar`}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── done ─────────────────────────

function DonePage({ donationId, onProgram, onHome, onRetryForm }: { donationId: string; onProgram: () => void; onHome: () => void; onRetryForm: () => void }) {
  const { customer, isLoading } = useCustomerAuth();
  const [status, setStatus] = useState<DonationStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const sourceId = customer?.sourceId ?? "";
  const email = customer?.email ?? "";

  useEffect(() => {
    if (isLoading || !sourceId) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const next = await fetchJumatBerkahDonationStatus({ sourceId, email, donationId });
        if (cancelled) return;
        setStatus(next);
        setFailed(false);
        if (next.status === "paid" || next.status === "cancelled" || next.status === "refunded") return;
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (Date.now() - startedAt > 120_000) { if (!cancelled) setTimedOut(true); return; }
      window.setTimeout(() => { if (!cancelled) void tick(); }, 3000);
    };
    void tick();
    return () => { cancelled = true; };
  }, [donationId, email, isLoading, sourceId]);

  if (isLoading || (!status && !failed)) return <div className="px-3 pt-4"><CustomerSectionSkeleton label="Memeriksa pembayaran" /></div>;
  if (!sourceId) return <div className="px-3 pt-4"><CustomerErrorState message="Masuk dengan akun yang sama untuk melihat sedekahmu." onRetry={onHome} /></div>;

  if (status?.status === "paid") {
    const shareText = `Aku baru sedekah ${status.portions ?? ""} porsi lewat Jumat Berkah Djiwa Tentram. Yuk ikut berbagi setiap Jumat: ${window.location.origin}`;
    return (
      <div className="px-3 pt-6">
        <section className="rounded-[26px] bg-gradient-to-br from-[#0F5C4D] to-[#0A3A31] p-6 text-center text-white shadow-lg" aria-live="polite">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F3D58A] text-[#0A3A31]"><Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" /></span>
          <h2 className="mt-4 font-display text-2xl font-black">Jazakumullahu khairan</h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-50/90">{status.portions} porsi atas nama <b>{status.displayName}</b> akan dibagikan {formatDistributionDate(status.distributionDate ?? "")}.</p>
          {status.prayer ? <p className="mt-4 rounded-2xl bg-white/12 p-3 text-sm leading-relaxed">“{status.prayer}”<br /><span className="text-xs text-emerald-50/75">{status.prayerStatus === "pending" ? "Doamu menunggu tinjauan singkat sebelum tampil." : "Doamu sudah tampil di halaman Jumat Berkah."}</span></p> : null}
        </section>
        <div className="mt-4 space-y-2.5">
          <button type="button" onClick={onProgram} className="min-h-12 w-full rounded-full bg-[#0F6B58] text-sm font-extrabold text-white">Lihat doaku di dinding</button>
          <button type="button" onClick={() => { const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`; window.open(url, "_blank", "noopener"); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-bold"><Share2 className="h-4 w-4" /> Ajak teman lewat WhatsApp</button>
          <button type="button" onClick={onHome} className="min-h-11 w-full text-sm font-semibold text-muted-foreground">Kembali ke beranda</button>
        </div>
      </div>
    );
  }

  if (status?.status === "cancelled" || status?.status === "refunded") {
    return <div className="px-3 pt-6"><div className={cn(CARD, "p-6 text-center")}><p className="font-display text-lg font-black">Sedekah ini tidak dilanjutkan</p><p className="mt-1 text-sm text-muted-foreground">Belum ada dana yang tercatat. Kamu bisa mencoba lagi kapan saja.</p><button type="button" onClick={onRetryForm} className="mt-4 min-h-12 w-full rounded-full bg-[#0F6B58] text-sm font-extrabold text-white">Sedekah lagi</button></div></div>;
  }

  return (
    <div className="px-3 pt-6">
      <div className={cn(CARD, "p-6 text-center")} aria-live="polite">
        {timedOut ? (
          <>
            <p className="font-display text-lg font-black">Pembayaran belum terkonfirmasi</p>
            <p className="mt-1 text-sm text-muted-foreground">Jika kamu sudah membayar, tenang saja: kami akan memberi tahu lewat notifikasi begitu terkonfirmasi.</p>
            {status?.invoiceUrl ? <button type="button" onClick={() => window.location.assign(status.invoiceUrl as string)} className="mt-4 min-h-12 w-full rounded-full bg-[#0F6B58] text-sm font-extrabold text-white">Lanjutkan pembayaran</button> : null}
            <button type="button" onClick={onHome} className="mt-2 min-h-11 w-full text-sm font-semibold text-muted-foreground">Kembali ke beranda</button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0F6B58]" aria-hidden="true" />
            <p className="mt-3 font-display text-lg font-black">Memeriksa pembayaran…</p>
            <p className="mt-1 text-sm text-muted-foreground">Mohon tunggu sebentar, jangan tutup halaman ini.</p>
          </>
        )}
      </div>
    </div>
  );
}
