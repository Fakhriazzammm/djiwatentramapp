import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, CloudUpload, MapPin, RefreshCw, ShieldCheck, Trophy, Upload, XCircle } from "lucide-react";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { DjiwaRunUnavailableError, confirmDjiwaRunActivity, getDjiwaRunOverview, submitDjiwaRunActivity, type RunActivity, type RunLocation, type RunOcrResult, type RunOverview, type RunSubmissionResult } from "@/lib/djiwa-run-client";

export const Route = createLazyFileRoute("/$username/run")({ component: DjiwaRunPage });

type LocationState = "idle" | "loading" | "inside" | "outside" | "permission_denied" | "unavailable" | "timeout";
type SubmissionState = "idle" | "processing" | "confirmation" | "accepted" | "review" | "rejected" | "unavailable" | "error";

const runSpring = { type: "spring" as const, stiffness: 320, damping: 28, mass: 0.8 };
const runReveal = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: runSpring } };

const EMPTY_OVERVIEW: RunOverview = {
  campaignName: "Djiwa Run", periodLabel: "Periode aktif", monthlyDistanceKm: 0, monthlyTargetKm: 0,
  weeklyDistanceKm: 0, weeklyTargetKm: 0, tiers: [], activities: [], rewardStatus: null, rewardName: null, rewardExpiresAt: null,
};

function formatKm(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Math.max(0, value));
}

function progress(distance: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((distance / target) * 100)) : 0;
}

function locationMessage(state: LocationState) {
  if (state === "loading") return "Sedang mendeteksi lokasi...";
  if (state === "inside") return "Kamu berada di area Djiwa Tentram. Sekarang upload screenshot hasil olahragamu.";
  if (state === "outside") return "Kamu belum berada di area Djiwa Tentram. Datang ke area cafe lalu coba lagi.";
  if (state === "permission_denied") return "Izin lokasi ditolak. Aktifkan akses lokasi di pengaturan browser, lalu coba deteksi ulang.";
  if (state === "timeout") return "Deteksi lokasi terlalu lama. Pastikan layanan lokasi aktif, lalu coba lagi.";
  if (state === "unavailable") return "Lokasi tidak tersedia di perangkat ini. Coba lagi di area dengan sinyal yang lebih baik.";
  return "Izinkan lokasi satu kali untuk membuka upload screenshot.";
}

function statusLabel(status: RunActivity["status"]) {
  if (status === "accepted") return "Diterima";
  if (status === "rejected") return "Ditolak";
  return "Dalam review";
}

function DjiwaRunPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { customer, isAuthenticated, isLoading: authLoading } = useCustomerAuth();
  const [overview, setOverview] = useState<RunOverview>(EMPTY_OVERVIEW);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [location, setLocation] = useState<RunLocation | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [submission, setSubmission] = useState<RunSubmissionResult | null>(null);
  const [ocrResult, setOcrResult] = useState<RunOcrResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isAuthenticated || !customer?.sourceId) {
      setOverviewLoading(false);
      return;
    }
    let active = true;
    setOverviewLoading(true);
    getDjiwaRunOverview(customer.sourceId, customer.email)
      .then((value) => { if (active) { setOverview(value); setOverviewError(null); } })
      .catch((error: unknown) => { if (active) setOverviewError(error instanceof DjiwaRunUnavailableError ? error.message : "Progres Djiwa Run belum dapat dimuat."); })
      .finally(() => { if (active) setOverviewLoading(false); });
    return () => { active = false; };
  }, [customer?.sourceId, isAuthenticated]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const detectLocation = () => {
    if (!navigator.geolocation) { setLocationState("unavailable"); return; }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        setLocationState("inside");
      },
      (error) => {
        setLocation(null);
        setLocationState(error.code === 1 ? "permission_denied" : error.code === 3 ? "timeout" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (!file.type.startsWith("image/")) { setFileError("Gunakan file gambar JPG, PNG, atau WEBP."); return; }
    if (file.size > 10 * 1024 * 1024) { setFileError("Ukuran screenshot maksimal 10 MB."); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setSubmission(null);
    setOcrResult(null);
    setSubmissionState("idle");
    setSubmissionError(null);
  };

  const submit = async () => {
    if (!customer?.sourceId || !overview.campaignId || !selectedFile || !location || locationState !== "inside") return;
    setSubmissionState("processing");
    setSubmissionError(null);
    try {
      const result = await submitDjiwaRunActivity({ campaignId: overview.campaignId, customerSourceId: customer.sourceId, customerEmail: customer.email, file: selectedFile, location, idempotencyKey: window.crypto.randomUUID() });
      setOcrResult(result);
      setSubmission(null);
      setSubmissionState(result.status === "rejected" ? "rejected" : result.status === "unavailable" ? "unavailable" : "confirmation");
    } catch (error) {
      setSubmissionState(error instanceof DjiwaRunUnavailableError ? "unavailable" : "error");
      setSubmissionError(error instanceof Error ? error.message : "Upload belum dapat diproses.");
    }
  };

  const confirm = async () => {
    if (!customer?.sourceId || !overview.campaignId || !location || !ocrResult?.proofStoragePath || ocrResult.status !== "confirmation_required") return;
    setSubmissionState("processing");
    setSubmissionError(null);
    try {
      const result = await confirmDjiwaRunActivity({ campaignId: overview.campaignId, customerSourceId: customer.sourceId, customerEmail: customer.email, proofStoragePath: ocrResult.proofStoragePath, extractedData: ocrResult.extractedData, location, idempotencyKey: window.crypto.randomUUID() });
      setSubmission(result);
      setSubmissionState(result.status);
    } catch (error) {
      setSubmissionState(error instanceof DjiwaRunUnavailableError ? "unavailable" : "error");
      setSubmissionError(error instanceof Error ? error.message : "Aktivitas belum dapat dikirim.");
    }
  };

  if (authLoading || overviewLoading) return <CustomerSectionSkeleton label="Menyiapkan Djiwa Run" />;

  if (!isAuthenticated || !customer) {
    return (
      <div className="app-page min-h-app"><div className="app-shell mx-auto min-h-app max-w-md bg-background">
        <CustomerHeader title="Djiwa Run" subtitle="Djiwa Tentram" onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} />
        <main className="space-y-3 px-3 py-5"><section className="rounded-3xl border border-border bg-card p-5 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-base font-black">Masuk untuk ikut Djiwa Run</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Progres, aktivitas, dan reward Djiwa Run hanya tersedia untuk member.</p><button type="button" onClick={() => navigate({ to: "/masuk" })} className="mt-4 min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Masuk / Daftar</button></section></main>
      </div></div>
    );
  }

  const monthlyPercent = progress(overview.monthlyDistanceKm, overview.monthlyTargetKm);
  const weeklyPercent = progress(overview.weeklyDistanceKm, overview.weeklyTargetKm);
  const locationReady = locationState === "inside";

  const revealProps = reduceMotion ? {} : { initial: "hidden", animate: "show", variants: runReveal };

  return (
    <div className="app-page min-h-app"><div className="app-shell mx-auto min-h-app max-w-md overflow-x-hidden bg-background">
      <CustomerHeader title="Djiwa Run" subtitle={overview.periodLabel} onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} />
      <main className="space-y-4 px-3 py-4 pb-32">
        {overviewError ? <motion.div {...revealProps} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950" role="status"><p className="font-black">Data campaign belum tersedia</p><p className="mt-0.5">{overviewError} Tampilan progres akan muncul setelah backend Djiwa Run aktif.</p></motion.div> : null}

        <motion.section {...revealProps} className="relative overflow-hidden rounded-[28px] bg-[#0d2d54] p-5 text-white shadow-[0_12px_30px_rgba(13,45,84,0.18)]" aria-labelledby="run-progress-title">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">{overview.campaignName}</p><h2 id="run-progress-title" className="mt-1 text-[22px] font-black tracking-tight">Buktikan langkahmu.</h2><p className="mt-1 max-w-[240px] text-xs leading-relaxed text-blue-100">Setiap kilometer mendekatkanmu ke reward Djiwa Pay.</p></div><motion.div animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [0, 4, 0] }} transition={reduceMotion ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}><Trophy className="h-8 w-8 text-[#f4d27a]" aria-hidden="true" /></motion.div></div>
          <div className="relative mt-5 flex items-end justify-between gap-2"><p className="text-4xl font-black tracking-tight">{formatKm(overview.monthlyDistanceKm)} <span className="text-sm font-bold text-blue-100">/ {overview.monthlyTargetKm > 0 ? `${formatKm(overview.monthlyTargetKm)} KM` : "target KM"}</span></p><span className="rounded-full bg-white/10 px-2.5 py-1 text-sm font-black text-[#f4d27a]">{monthlyPercent}%</span></div>
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full rounded-full bg-[#f4d27a]" initial={{ width: 0 }} animate={{ width: `${monthlyPercent}%` }} transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: [0.32, 0.72, 0, 1] }} /></div><p className="relative mt-2 text-[11px] text-blue-100">Progress dihitung dari aktivitas yang lolos validasi server.</p>
        </motion.section>

        <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.06 }} className="grid grid-cols-3 gap-2" aria-label="Ringkasan progres">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><p className="text-[10px] font-bold text-muted-foreground">Bulan ini</p><p className="mt-1 text-lg font-black tracking-tight">{formatKm(overview.monthlyDistanceKm)}</p><p className="text-[10px] font-bold text-primary">{monthlyPercent}%</p></div>
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><p className="text-[10px] font-bold text-muted-foreground">Sprint</p><p className="mt-1 text-lg font-black tracking-tight">{formatKm(overview.weeklyDistanceKm)}</p><p className="text-[10px] font-bold text-primary">{weeklyPercent}%</p></div>
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><p className="text-[10px] font-bold text-muted-foreground">Tier</p><p className="mt-1 text-lg font-black tracking-tight">{overview.tiers.length || 0}</p><p className="text-[10px] font-bold text-primary">level</p></div>
        </motion.section>

        <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.1 }} className="rounded-[26px] border border-primary/20 bg-primary/5 p-4 shadow-sm" aria-labelledby="upload-area-title"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><MapPin className="h-5 w-5" /></span><div><h2 id="upload-area-title" className="text-sm font-black">Satu langkah lagi</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Izinkan lokasi di area Djiwa Tentram untuk membuka upload bukti lari.</p></div></div><div className={`mt-3 rounded-2xl border px-3 py-3 text-xs ${locationReady ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-border bg-card text-foreground"}`} role="status" aria-live="polite"><p className="font-black">{locationMessage(locationState)}</p>{locationState !== "inside" ? <button type="button" onClick={detectLocation} disabled={locationState === "loading"} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-60">{locationState === "loading" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} {locationState === "idle" ? "Izinkan lokasi" : "Coba deteksi ulang"}</button> : <p className="mt-1 text-[11px]">Lokasi hanya digunakan untuk validasi upload ini.</p>}</div></motion.section>

        <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.14 }} className="rounded-[26px] border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Langkah berikutnya</p><h2 className="mt-1 text-base font-black">Upload screenshot fitness</h2></div><CloudUpload className="h-5 w-5 text-primary" /></div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nama, tanggal, jenis aktivitas, dan jarak harus terlihat jelas.</p><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />{previewUrl ? <div className="mt-3 overflow-hidden rounded-2xl border border-border"><img src={previewUrl} alt="Preview screenshot aktivitas" className="max-h-72 w-full object-contain bg-muted/30" /><div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2"><span className="min-w-0 truncate text-[11px] font-bold">{selectedFile?.name}</span><button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }} className="min-h-10 rounded-xl px-2 text-xs font-black text-destructive">Hapus</button></div></div> : null}{fileError ? <p className="mt-2 text-xs font-bold text-destructive" role="alert">{fileError}</p> : null}<button type="button" onClick={() => fileInputRef.current?.click()} disabled={!locationReady || submissionState === "processing"} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-4 w-4" /> Pilih screenshot</button>{selectedFile && locationReady && submissionState !== "confirmation" ? <button type="button" onClick={submit} disabled={submissionState === "processing"} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-60">{submissionState === "processing" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Kirim untuk dibaca AI</button> : null}
          {submissionState === "processing" ? <p className="mt-3 text-center text-xs text-muted-foreground">Vision AI sedang membaca bukti aktivitas.</p> : null}
          {submissionState === "confirmation" && ocrResult ? <OcrConfirmation result={ocrResult} onConfirm={confirm} /> : null}
          {submissionState === "unavailable" ? <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950" role="alert">OCR Djiwa Run belum tersedia. Screenshot tidak dianggap berhasil dan tidak mengubah progress.</p> : null}
          {submissionState === "error" ? <p className="mt-3 text-xs font-bold text-destructive" role="alert">{submissionError}</p> : null}
          {submissionState === "rejected" && ocrResult ? <OcrRejected result={ocrResult} /> : null}
          {submissionState === "accepted" || submissionState === "review" ? <SubmissionResult result={submission} /> : null}</motion.section>

        <div className="grid grid-cols-2 gap-2">
          <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.18 }} className="rounded-[24px] border border-border bg-card p-3 shadow-sm"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><h2 className="text-xs font-black">Tier & reward</h2></div>{overview.tiers.length > 0 ? <div className="mt-3 space-y-2">{overview.tiers.slice(0, 3).map((tier) => <div key={tier.code} className="rounded-2xl bg-muted/40 px-2.5 py-2"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tier.status === "completed" || tier.status === "upgraded" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}>{tier.status === "completed" || tier.status === "upgraded" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />}</span><p className="min-w-0 text-[11px] font-black">{tier.name}</p></div><p className="mt-1 text-[10px] text-muted-foreground">{formatKm(tier.distanceKm)} / {formatKm(tier.targetKm)} KM</p></div>)}</div> : <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Reward akan muncul saat campaign aktif.</p>}</motion.section>
          <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.22 }} className="rounded-[24px] border border-border bg-card p-3 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-xs font-black">Djiwa Pay</h2></div>{overview.rewardName ? <div className="mt-3 rounded-2xl bg-primary/5 px-2.5 py-2"><p className="text-[11px] font-black">{overview.rewardName}</p><p className="mt-1 text-[10px] text-muted-foreground">{overview.rewardStatus ?? "Tersedia"}{overview.rewardExpiresAt ? ` · s/d ${new Date(overview.rewardExpiresAt).toLocaleDateString("id-ID")}` : ""}</p>{overview.rewardId && ["unlocked", "credited"].includes(overview.rewardStatus ?? "") ? <button type="button" onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "menu", runRewardId: overview.rewardId ?? undefined } })} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-primary px-2 py-2 text-[11px] font-black text-primary-foreground">Gunakan di Pesan</button> : null}</div> : <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Belum ada reward terbuka.</p>}</motion.section>
        </div>

        <motion.section {...revealProps} transition={reduceMotion ? undefined : { ...runSpring, delay: 0.26 }} className="rounded-[26px] border border-border bg-card p-4 shadow-sm"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-black">Riwayat aktivitas</h2></div>{overview.activities.length > 0 ? <div className="mt-3 space-y-2">{overview.activities.map((activity) => <div key={activity.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0"><div className="min-w-0 flex-1"><p className="text-xs font-black">{activity.activityType} · {formatKm(activity.distanceKm)} KM</p><p className="text-[11px] text-muted-foreground">{activity.activityDate || "Tanggal belum tersedia"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${activity.status === "accepted" ? "bg-emerald-100 text-emerald-700" : activity.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{statusLabel(activity.status)}</span></div>)}</div> : <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground">Belum ada aktivitas tercatat. Upload bukti pertamamu untuk mulai!</p>}</motion.section>
      </main>
    </div></div>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "Belum terbaca";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit${seconds % 60 ? ` ${seconds % 60} detik` : ""}`;
}

function OcrConfirmation({ result, onConfirm }: { result: RunOcrResult; onConfirm: () => void }) {
  const data = result.extractedData;
  return <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-xs leading-relaxed" role="status"><p className="font-black">Periksa hasil pembacaan screenshot</p><p className="mt-1 text-muted-foreground">Pastikan data berikut sesuai sebelum aktivitas dikirim.</p><dl className="mt-3 grid grid-cols-2 gap-2">{[["Nama", data.ownerName ?? "Belum terbaca"], ["Tanggal", data.activityDate ?? "Belum terbaca"], ["Jenis", data.activityType ?? "Belum terbaca"], ["Jarak", data.distanceKm == null ? "Belum terbaca" : `${formatKm(data.distanceKm)} KM`], ["Durasi", formatDuration(data.durationSeconds)], ["Confidence", data.confidence == null ? "Belum tersedia" : `${Math.round(data.confidence <= 1 ? data.confidence * 100 : data.confidence)}%`]].map(([label, value]) => <div key={label} className="rounded-xl bg-card px-2.5 py-2"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="font-black">{value}</dd></div>)}</dl><button type="button" onClick={onConfirm} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[14px] bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Data sudah benar, kirim aktivitas</button></div>;
}

function OcrRejected({ result }: { result: RunOcrResult }) {
  return <div className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-xs leading-relaxed text-red-950" role="alert"><div className="flex items-center gap-2 font-black"><XCircle className="h-4 w-4" /> Screenshot tidak lolos pemeriksaan</div><p className="mt-1">{result.message ?? "Data aktivitas tidak dapat diverifikasi. Periksa screenshot lalu unggah ulang."}</p></div>;
}

function SubmissionResult({ result }: { result: RunSubmissionResult | null }) {
  const accepted = result?.status === "accepted";
  const rejected = result?.status === "rejected";
  return <div className={`mt-3 rounded-2xl px-3 py-3 text-xs leading-relaxed ${accepted ? "bg-emerald-50 text-emerald-950" : rejected ? "bg-red-50 text-red-950" : "bg-amber-50 text-amber-950"}`} role="status"><div className="flex items-center gap-2 font-black">{accepted ? <CheckCircle2 className="h-4 w-4" /> : rejected ? <XCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{accepted ? "Aktivitas diterima" : rejected ? "Aktivitas ditolak" : "Aktivitas sedang ditinjau"}</div><p className="mt-1">{result?.message ?? (accepted ? "Progress akan diperbarui oleh server." : rejected ? "Periksa kembali screenshot dan unggah bukti yang lebih jelas." : "Tim akan meninjau bukti aktivitasmu.")}</p>{result?.extractedData?.distanceKm != null ? <p className="mt-1 font-bold">Jarak terbaca: {formatKm(result.extractedData.distanceKm)} KM</p> : null}</div>;
}
