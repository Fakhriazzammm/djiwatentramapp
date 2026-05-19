import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Loader2,
  LogIn,
  MailQuestion,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings, useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { normalizeEmployeeOnboardingSettings, getRoleSalaryDefaults } from "@/lib/employee-onboarding-settings";
import { useHybridSignContract } from "@/hooks/use-employee-onboarding-actions";
import { toast } from "sonner";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { SignaturePad } from "@/components/employee-onboarding/signature-pad";
import {
  buildEmployeeContractTemplate,
  buildContractVariableContext,
  replaceContractVariables,
  type EmployeeOnboardingDraft,
} from "@/lib/employee-onboarding-schema";
import { dataUrlToBlob, generateContractPdfBlob } from "@/lib/contract-pdf";
import { Label } from "@/components/ui/label";

// ─── Status config ───────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { icon: any; iconClass: string; bgClass: string; borderClass: string; badge: string; title: string }> = {
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
  contract_signed: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/20",
    borderClass: "border-emerald-200 dark:border-emerald-800",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    title: "Kontrak Ditandatangani ✅",
  },
} as const;

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
  const roles = useHybridStaffRoles() ?? [];
  const onboardingSettings = normalizeEmployeeOnboardingSettings(
    siteSettings?.employeeOnboarding,
  );
  const signContract = useHybridSignContract();
  const companyDisplayName = String(
    siteSettings?.companyName ||
      siteSettings?.businessName ||
      siteSettings?.storeName ||
      siteSettings?.name ||
      onboardingSettings.signatoryName ||
      "Djiwa Tentram",
  ).trim();
  const signatoryPersonName = onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName;

  const [app, setApp] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [phase, setPhase] = useState<"tracking" | "contract" | "signature">("tracking");
  const [isSigning, setIsSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [agreedData, setAgreedData] = useState(false);
  const [agreedContract, setAgreedContract] = useState(false);

  const status = (app?.status || "pending") as string;
  const pipelineStep = app?.raw?.pipelineStep || "submitted";
  const isContractPhase = app?.status === "approved" && pipelineStep !== "contract_signed";
  const cfg = status in STATUS_CONFIG ? STATUS_CONFIG[status] : STATUS_CONFIG.pending;

  // ── Fetch application data ──
  const fetchApp = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("employee_onboarding_applications")
      .select("*")
      .filter("raw->>registrationNumber", "eq", registrationNumber)
      .maybeSingle();

    if (error) {
      console.error("[Selesai] Query error:", error);
    }
    if (data) {
      setApp(data);
      setNotFound(false);
    } else if (!app) {
      setNotFound(true);
    }
  }, [registrationNumber]);

  useEffect(() => {
    fetchApp().finally(() => setIsLoading(false));
  }, [registrationNumber]);

  // ── Polling: every 30s while pending ──
  useEffect(() => {
    if (status !== "pending" && pipelineStep !== "submitted") return;
    const interval = setInterval(fetchApp, 30000);
    return () => clearInterval(interval);
  }, [status, pipelineStep, fetchApp]);

  // ── Build contract preview from app data ──
  function buildContractPreview() {
    if (!app) return null;
    const roleTemplate = onboardingSettings.contractTemplatesByRoleId[app.employment?.roleId || ""];
    const defaultTemplate = onboardingSettings.contractTemplatesByRoleId.__default__;
    const templateText = roleTemplate || defaultTemplate;
    const selectedRole = roles.find((r: any) => String(r?._id) === app.employment?.roleId);
    const roleDefaults = selectedRole ? getRoleSalaryDefaults(selectedRole) : { bonusTargetConfig: null, customAllowances: [] };

    if (templateText) {
      const templateStr = typeof templateText === "string" ? templateText :
        (templateText as any).title + "\n" + (templateText as any).clauses?.map((c: any) => c.title + "\n" + c.body).join("\n\n") || "";
      const ctx = buildContractVariableContext(
        { fullName: app.full_name, email: app.email, phone: app.phone, identityNumber: app.identity_number, address: app.address, birthDate: app.birth_date, placeOfBirth: app.birth_place, emergencyContactName: app.emergency_contact?.name, emergencyContactPhone: app.emergency_contact?.phone } as any,
        app.employment || {},
        companyDisplayName,
        signatoryPersonName,
        onboardingSettings.signatoryCompanyAddress,
        onboardingSettings.signatoryCompanyNIB,
        onboardingSettings.signatoryPersonTitle,
        onboardingSettings.signatoryLocation,
      );
      const syncedText = replaceContractVariables(templateStr, ctx);
      const htmlParagraphs = syncedText.split("\n").map((l: string) => l.trim()).filter(Boolean).map((para: string) => `<p>${para}</p>`).join("\n");
      return { mode: "template" as const, title: `Perjanjian Kerja ${app.employment?.roleName || ""}`, plainText: syncedText, html: `<article>${htmlParagraphs}</article>`, clauses: [{ title: "Ketentuan Kontrak", body: syncedText }] };
    }

    const personal: EmployeeOnboardingDraft["personal"] = {
      fullName: app.full_name || "",
      email: app.email || "",
      phone: app.phone || "",
      identityNumber: app.identity_number || "",
      address: app.address || "",
      birthDate: app.birth_date || "",
      emergencyContactName: app.emergency_contact?.name || "",
      emergencyContactPhone: app.emergency_contact?.phone || "",
    };
    const built = buildEmployeeContractTemplate(personal, app.employment || {}, companyDisplayName, (roleDefaults as any).bonusTargetConfig ?? undefined, (roleDefaults as any).customAllowances ?? []);
    const ctx = buildContractVariableContext(personal as any, app.employment || {}, companyDisplayName, signatoryPersonName, onboardingSettings.signatoryCompanyAddress, onboardingSettings.signatoryCompanyNIB, onboardingSettings.signatoryPersonTitle, onboardingSettings.signatoryLocation);
    return {
      ...built,
      plainText: replaceContractVariables(built.plainText, ctx),
      clauses: built.clauses.map((c) => ({ ...c, body: replaceContractVariables(c.body, ctx) })),
      html: `<article>${built.clauses.map((c) => {
        const body = replaceContractVariables(c.body, ctx);
        const paras = body.split("\n").map((l: string) => l.trim()).filter(Boolean).map((p: string) => `<p>${p}</p>`).join("\n");
        return `<section><h3>${c.title}</h3>${paras}</section>`;
      }).join("")}</article>`,
    };
  }

  const contractPreview = buildContractPreview();

  // ── Sign contract handler ──
  async function handleSignContract() {
    if (!agreedData || !agreedContract || !signatureDataUrl) {
      if (!signatureDataUrl) toast.error("Silakan tanda tangan terlebih dahulu");
      else toast.error("Setujui semua persyaratan terlebih dahulu");
      return;
    }
    setIsSigning(true);
    try {
      const supabase = createClient();
      const appKey = `sel_${app.id}_${Date.now()}`;
      
      // 1. Upload signature
      const sigBlob = await dataUrlToBlob(signatureDataUrl);
      const { error: sigError, data: sigData } = await supabase.storage
        .from("employee-contracts")
        .upload(`signatures/${appKey}.png`, sigBlob, { contentType: "image/png", upsert: false });
      if (sigError) throw new Error("Gagal upload tanda tangan: " + sigError.message);
      const { data: sigPublic } = supabase.storage.from("employee-contracts").getPublicUrl(sigData.path);
      const signatureUrl = sigPublic.publicUrl;

      // 2. Generate & upload PDF
      const contractText = contractPreview?.plainText || "";
      const draft = { 
        personal: { fullName: app.full_name, email: "", phone: "", identityNumber: "", address: "", birthDate: "", emergencyContactName: "", emergencyContactPhone: "" }, 
        employment: app.employment || {}, 
        contract: contractPreview || { mode: "template", title: "Perjanjian Kerja", plainText: contractText, clauses: [] }, 
        signatureDataUrl, 
        agreements: { dataIsTrue: true, contractApproved: true } 
      };
      const pdfBlob = await generateContractPdfBlob(draft as any, document.getElementById("employee-contract-preview"));
      const { error: pdfError, data: pdfData } = await supabase.storage
        .from("employee-contracts")
        .upload(`contracts/${appKey}.pdf`, pdfBlob, { contentType: "application/pdf", upsert: false });
      if (pdfError) throw new Error("Gagal upload kontrak: " + pdfError.message);
      const { data: pdfPublic } = supabase.storage.from("employee-contracts").getPublicUrl(pdfData.path);
      const contractPdfUrl = pdfPublic.publicUrl;

      // 3. Finalize via edge function
      await signContract({ applicationId: app.id, signatureUrl, contractPdfUrl, contractText });

      toast.success("Kontrak berhasil ditandatangani! 🎉");
      setPhase("tracking");
      setSignatureDataUrl("");
      setAgreedData(false);
      setAgreedContract(false);
      await fetchApp();
    } catch (e: any) {
      toast.error(e?.message || "Gagal tanda tangan kontrak");
    } finally {
      setIsSigning(false);
    }
  }

  // ── Loading ──
  if (isLoading) return <Skeleton />;

  // ── Not Found ──
  if (notFound && !app) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
        <div className="w-full max-w-lg space-y-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <FileSignature className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Pendaftaran Tidak Ditemukan</h1>
          <Card>
            <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
              <XCircle className="h-16 w-16 text-amber-400" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Nomor pendaftaran <strong>{registrationNumber}</strong> tidak ditemukan.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => (window.location.href = "/register")}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Daftar Baru
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <Loader2 className="mr-2 h-4 w-4" /> Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Phase: Contract Review (after approved) ──
  if (phase === "contract" && isContractPhase) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-3 py-6 sm:px-4 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPhase("tracking")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> Kontrak Kerja</Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Review & Tanda Tangan Kontrak</h1>
          <Card className="border sm:rounded-xl">
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Kontrak Kerja</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Baca kontrak dengan saksama sebelum melanjutkan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contractPreview?.plainText ? (
                <ContractPreview contract={contractPreview} employeeName={app.full_name} companyName={companyDisplayName} signatoryName={signatoryPersonName} signatorySignatureUrl={onboardingSettings.signatorySignatureUrl} />
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">Kontrak akan tersedia setelah admin menyiapkan template.</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPhase("tracking")}>
              Batal
            </Button>
            <Button onClick={() => setPhase("signature")}>
              Setuju & Lanjut ke Tanda Tangan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Signature ──
  if (phase === "signature" && isContractPhase) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-3 py-6 sm:px-4 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPhase("contract")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="gap-1"><FileSignature className="h-3 w-3" /> Tanda Tangan</Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Tanda Tangan Kontrak</h1>
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            <Card className="flex-1 border sm:rounded-xl">
              <CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Tanda Tangan & Submit</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                <label className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox checked={agreedData} onCheckedChange={(v) => setAgreedData(Boolean(v))} className="size-5 border-2" />
                  <span className="font-medium text-foreground select-none">Saya menyatakan data yang saya isi benar.</span>
                </label>
                <label className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox checked={agreedContract} onCheckedChange={(v) => setAgreedContract(Boolean(v))} className="size-5 border-2" />
                  <span className="font-medium text-foreground select-none">Saya menyetujui isi kontrak kerja.</span>
                </label>
              </CardContent>
            </Card>
            <div className="flex-1">
              {contractPreview && (
                <ContractPreview contract={contractPreview} employeeName={app.full_name} signatureDataUrl={signatureDataUrl} companyName={companyDisplayName} signatoryName={signatoryPersonName} signatorySignatureUrl={onboardingSettings.signatorySignatureUrl} />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPhase("contract")} disabled={isSigning}>
              Kembali
            </Button>
            <Button onClick={handleSignContract} disabled={isSigning || !agreedData || !agreedContract || !signatureDataUrl}>
              {isSigning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...</> : "Kirim Tanda Tangan"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Default: Tracking phase ──
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
            {app?.full_name || "Pendaftaran Karyawan"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {app?.employment?.roleName
              ? `${app.employment.roleName} · ${companyDisplayName}`
              : "Pendaftaran karyawan baru"}
          </p>
        </div>

        {/* ── Status Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className={`${cfg.borderClass} overflow-hidden`}>
            <div className={`h-1.5 w-full ${status === "pending" ? "bg-amber-400" : status === "approved" || status === "contract_signed" ? "bg-emerald-500" : status === "rejected" ? "bg-red-500" : "bg-orange-500"}`} />

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
                      <br />Proses biasanya memakan waktu 1–2 hari kerja.
                    </p>
                  </div>
                  <div className="w-full space-y-3 rounded-xl bg-muted/40 px-4 py-4">
                    <p className="flex items-start justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                      Halaman ini akan otomatis memperbarui status. Simpan URL ini untuk dipantau.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => (window.location.href = "/")}>
                    Kembali ke Beranda
                  </Button>
                </>
              )}

              {/* ── Approved (need contract signing) ── */}
              {status === "approved" && pipelineStep !== "contract_signed" && (
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
                      <br />Lanjutkan ke penandatanganan kontrak kerja.
                    </p>
                  </div>
                  <Button className="w-full gap-2" onClick={() => setPhase("contract")}>
                    <FileSignature className="h-4 w-4" />
                    Lanjut ke Tanda Tangan Kontrak
                  </Button>
                </>
              )}

              {/* ── Contract Signed ── */}
              {(status === "approved" && pipelineStep === "contract_signed") || status === "contract_signed" ? (
                <>
                  <div className="relative">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle2 className="relative h-10 w-10 text-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <Badge className={cfg.badge}>Kontrak Ditandatangani ✅</Badge>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Semua proses selesai! Selamat bergabung dengan {companyDisplayName}.
                    </p>
                  </div>

                  {app.contract_pdf_url && (
                    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left dark:border-emerald-800/50 dark:bg-emerald-950/10">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider dark:text-emerald-400">
                        <FileSignature className="h-3.5 w-3.5" />
                        Kontrak Kerja
                      </p>
                      <a href={app.contract_pdf_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                        <Download className="h-4 w-4" />
                        Unduh PDF Kontrak
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:w-full">
                    <Button className="w-full gap-2" onClick={() => (window.location.href = "/karyawan/login")}>
                      <LogIn className="h-4 w-4" />
                      Masuk ke Akun Karyawan
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Gunakan PIN 6 digit yang diberikan oleh admin untuk login
                    </p>
                  </div>
                </>
              ) : null}

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
                        <ShieldCheck className="h-3.5 w-3.5" /> Alasan
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400">{app.review_notes}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" onClick={() => (window.location.href = "/register")}>
                      <RefreshCcw className="mr-2 h-4 w-4" /> Daftar Ulang
                    </Button>
                    <Button onClick={() => (window.location.href = "/")}>Kembali ke Beranda</Button>
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
                      Admin meminta beberapa perubahan pada data pendaftaran Anda.
                    </p>
                  </div>
                  {app.review_notes && (
                    <div className="w-full rounded-xl border border-orange-200 bg-orange-50 p-4 text-left dark:border-orange-800/50 dark:bg-orange-950/10">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-orange-700 uppercase tracking-wider dark:text-orange-400">
                        <MailQuestion className="h-3.5 w-3.5" /> Catatan Admin
                      </p>
                      <p className="text-sm text-orange-600 dark:text-orange-400">{app.review_notes}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" onClick={() => (window.location.href = "/register")}>
                      <RefreshCcw className="mr-2 h-4 w-4" /> Daftar Ulang
                    </Button>
                    <Button onClick={() => (window.location.href = "/")}>Kembali ke Beranda</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Save Link ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-5 text-center dark:border-sky-800/50 dark:bg-sky-950/10">
            <p className="mb-2 text-xs font-bold text-sky-700 uppercase tracking-wider dark:text-sky-400">
              💾 Simpan Halaman Ini
            </p>
            <p className="text-sm leading-relaxed text-sky-600 dark:text-sky-300">
              Simpan URL halaman ini untuk mengecek status pendaftaran nanti.
            </p>
          </div>
        </motion.div>

        {/* ── Registration Number ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <CopyField label="Nomor Pendaftaran" value={registrationNumber} />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="text-center text-xs text-muted-foreground/40"
        >
          {companyDisplayName} — Pendaftaran Karyawan
        </motion.p>
      </motion.div>
    </div>
  );
}

export const Route = createLazyFileRoute(
  "/register/selesai/$registrationNumber" as any,
)({
  component: RegisterCompletePage,
});
