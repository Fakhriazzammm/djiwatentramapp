import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  LogIn,
  MailQuestion,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import { toast } from "sonner";

// ─── Status config ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-50 dark:bg-amber-950/20",
    borderClass: "border-amber-200 dark:border-amber-800",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    title: "Menunggu Persetujuan",
  },
  approved: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/20",
    borderClass: "border-emerald-200 dark:border-emerald-800",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    title: "Pendaftaran Disetujui",
  },
  rejected: {
    icon: XCircle,
    iconClass: "text-red-500",
    bgClass: "bg-red-50 dark:bg-red-950/20",
    borderClass: "border-red-200 dark:border-red-800",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    title: "Pendaftaran Ditolak",
  },
  needs_revision: {
    icon: MailQuestion,
    iconClass: "text-orange-500",
    bgClass: "bg-orange-50 dark:bg-orange-950/20",
    borderClass: "border-orange-200 dark:border-orange-800",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    title: "Perlu Revisi",
  },
} as const;

type AppStatus = keyof typeof STATUS_CONFIG;

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-muted" />
        <div className="mx-auto h-5 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mx-auto h-3 w-32 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="space-y-4 px-6 py-10">
            <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-muted" />
            <div className="mx-auto h-5 w-36 animate-pulse rounded-md bg-muted" />
            <div className="mx-auto h-3 w-56 animate-pulse rounded bg-muted" />
            <div className="mx-auto h-10 w-40 animate-pulse rounded-xl bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Copyable field ──────────────────────────────────────────────────────────
function CopyField({ label, value }: { label: string; value: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(
      () => toast.success("Nomor pendaftaran disalin"),
      () => toast.error("Gagal menyalin"),
    );
  };

  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all font-mono text-xs tracking-wide text-foreground/80">
          {value}
        </code>
        <button
          onClick={handleCopy}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted-foreground/10 active:scale-95"
          title="Salin"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Animated pulse ring (for pending) ────────────────────────────────────────
function PulseRing() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="absolute h-full w-full animate-ping rounded-full bg-amber-400/20" />
      <span className="absolute h-[85%] w-[85%] animate-pulse rounded-full bg-amber-400/15" />
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
function RegisterCompletePage() {
  const { registrationNumber } = Route.useParams() as {
    registrationNumber: string;
  };
  const siteSettings = useHybridSiteSettings();
  const onboardingSettings = normalizeEmployeeOnboardingSettings(
    siteSettings?.employeeOnboarding,
  );
  const companyDisplayName = String(
    siteSettings?.companyName ||
      siteSettings?.businessName ||
      siteSettings?.storeName ||
      siteSettings?.name ||
      onboardingSettings.signatoryName ||
      "Djiwa Tentram",
  ).trim();

  const [app, setApp] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("employee_onboarding_applications")
      .select("*")
      .filter("raw->>registrationNumber", "eq", registrationNumber)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[Selesai] Query error:", error);
        }
        if (data) {
          setApp(data);
        } else {
          setNotFound(true);
        }
        setIsLoading(false);
      });
  }, [registrationNumber]);

  const status = (app?.status || "pending") as AppStatus;
  const cfg = status in STATUS_CONFIG ? STATUS_CONFIG[status] : STATUS_CONFIG.pending;

  // ── Loading ──
  if (isLoading) return <Skeleton />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-lg space-y-5"
      >
        {/* ── Header ── */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
          >
            <FileSignature className="h-7 w-7 text-primary" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {notFound
              ? "Pendaftaran Tidak Ditemukan"
              : app?.full_name || "Pendaftaran Karyawan"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {notFound
              ? `Tidak ada pendaftaran dengan nomor tersebut`
              : app?.employment?.roleName
                ? `${app.employment.roleName} · ${companyDisplayName}`
                : "Pendaftaran karyawan baru"}
          </p>
        </div>

        {/* ── Not Found ── */}
        {notFound ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <div className="relative">
                  <XCircle className="h-16 w-16 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Tidak Ditemukan</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nomor pendaftaran <strong>{registrationNumber}</strong> tidak
                    ditemukan di sistem kami.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => (window.location.href = "/register")}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Daftar Baru
                  </Button>
                  <Button onClick={() => window.location.reload()}>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Coba Lagi
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : app ? (
          <>
            {/* ── Status Card ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className={`${cfg.borderClass} overflow-hidden`}>
                {/* Colored top bar */}
                <div
                  className={`h-1.5 w-full ${status === "pending" ? "bg-amber-400" : status === "approved" ? "bg-emerald-500" : status === "rejected" ? "bg-red-500" : "bg-orange-500"}`}
                />

                <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
                  {/* ── Pending ── */}
                  {status === "pending" && (
                    <>
                      <div className="relative">
                        <PulseRing />
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <Clock className="relative h-10 w-10 text-amber-500" />
                        </div>
                      </div>

                      <div>
                        <Badge className={cfg.badge}>{cfg.title}</Badge>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          Pendaftaran Anda sedang ditinjau oleh tim admin.
                          <br />
                          Proses biasanya memakan waktu 1–2 hari kerja.
                        </p>
                      </div>

                      <div className="w-full space-y-2 rounded-xl bg-muted/40 px-4 py-3">
                        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <MailQuestion className="h-3.5 w-3.5" />
                          Anda akan mendapat notifikasi jika status berubah
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Hubungi admin jika belum ada perubahan dalam 3 hari.
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => (window.location.href = "/")}
                      >
                        Kembali ke Beranda
                      </Button>
                    </>
                  )}

                  {/* ── Approved ── */}
                  {status === "approved" && (
                    <>
                      <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                          <CheckCircle2 className="relative h-10 w-10 text-emerald-500" />
                        </div>
                      </div>

                      <div>
                        <Badge className={cfg.badge}>{cfg.title} 🎉</Badge>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          Selamat! Pendaftaran Anda telah disetujui.
                          <br />
                          Admin telah menyiapkan akun untuk Anda.
                        </p>
                      </div>

                      {app.contract_pdf_url && (
                        <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left dark:border-emerald-800/50 dark:bg-emerald-950/10">
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider dark:text-emerald-400">
                            <FileSignature className="h-3.5 w-3.5" />
                            Kontrak Kerja
                          </p>
                          <a
                            href={app.contract_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                          >
                            <Download className="h-4 w-4" />
                            Unduh PDF Kontrak
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}

                      <div className="flex flex-col gap-3 sm:w-full">
                        <Button
                          className="w-full gap-2"
                          onClick={() =>
                            (window.location.href = "/karyawan/login")
                          }
                        >
                          <LogIn className="h-4 w-4" />
                          Masuk ke Akun Karyawan
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Gunakan PIN 6 digit yang diberikan oleh admin untuk login
                        </p>
                      </div>
                    </>
                  )}

                  {/* ── Rejected ── */}
                  {status === "rejected" && (
                    <>
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                        <XCircle className="h-10 w-10 text-red-500" />
                      </div>

                      <div>
                        <Badge className={cfg.badge}>{cfg.title}</Badge>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          Mohon maaf, pendaftaran Anda tidak dapat diproses.
                        </p>
                      </div>

                      {app.review_notes && (
                        <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left dark:border-red-800/50 dark:bg-red-950/10">
                          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700 uppercase tracking-wider dark:text-red-400">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Alasan
                          </p>
                          <p className="text-sm text-red-600 dark:text-red-400">
                            {app.review_notes}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          onClick={() => (window.location.href = "/register")}
                        >
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Daftar Ulang
                        </Button>
                        <Button onClick={() => (window.location.href = "/")}>
                          Kembali ke Beranda
                        </Button>
                      </div>
                    </>
                  )}

                  {/* ── Needs Revision ── */}
                  {status === "needs_revision" && (
                    <>
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                        <MailQuestion className="h-10 w-10 text-orange-500" />
                      </div>

                      <div>
                        <Badge className={cfg.badge}>{cfg.title}</Badge>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          Admin meminta beberapa perubahan pada data pendaftaran
                          Anda.
                        </p>
                      </div>

                      {app.review_notes && (
                        <div className="w-full rounded-xl border border-orange-200 bg-orange-50 p-4 text-left dark:border-orange-800/50 dark:bg-orange-950/10">
                          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-orange-700 uppercase tracking-wider dark:text-orange-400">
                            <MailQuestion className="h-3.5 w-3.5" />
                            Catatan Admin
                          </p>
                          <p className="text-sm text-orange-600 dark:text-orange-400">
                            {app.review_notes}
                          </p>
                        </div>
                      )}

                      <div className="w-full space-y-2 rounded-xl bg-muted/40 px-4 py-3">
                        <p className="text-xs text-muted-foreground">
                          Silakan hubungi admin untuk memperbaiki data pendaftaran
                          Anda, atau daftar ulang dengan data yang benar.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          onClick={() => (window.location.href = "/register")}
                        >
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Daftar Ulang
                        </Button>
                        <Button onClick={() => (window.location.href = "/")}>
                          Kembali ke Beranda
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* ── Registration Number ── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <CopyField label="Nomor Pendaftaran" value={registrationNumber} />
            </motion.div>

            {/* ── Footer ── */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="text-center text-xs text-muted-foreground/40"
            >
              {companyDisplayName} — Pendaftaran Karyawan
            </motion.p>
          </>
        ) : null}
      </motion.div>
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/register/selesai/$registrationNumber" as any,
)({
  component: RegisterCompletePage,
});
