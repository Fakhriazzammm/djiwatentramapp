import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Eye, FileSignature, FileText, Loader2, PencilLine, ShieldCheck, Trash2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridApproveApplication, useHybridRejectApplication, useHybridMarkRevision, useHybridDeleteApplication } from "@/hooks/use-employee-onboarding-actions";
import { calculateEstimatedMonthlySalary } from "@/lib/employee-onboarding-schema";
import { formatOnboardingCurrency, generateSixDigitPin, normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import { jsPDF } from "jspdf";
import { Separator } from "@/components/ui/separator";

/* -------- helpers -------- */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	approved: "default",
	pending: "secondary",
	rejected: "destructive",
	needs_revision: "outline",
};

/* -------- component -------- */
function ApplicationDetailPage() {
	const { registrationNumber } = Route.useParams() as { registrationNumber: string };
	const navigate = useNavigate();
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
	const companyDisplayName = String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || onboardingSettings.signatoryName || "Djiwa Tentram").trim();
	const signatoryPersonName = onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName;

	const approveApp = useHybridApproveApplication();
	const rejectApp = useHybridRejectApplication();
	const markRevision = useHybridMarkRevision();
	const deleteApp = useHybridDeleteApplication();

	const [app, setApp] = useState<any | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	const [password, setPassword] = useState(onboardingSettings.defaultPassword);
	const [pin, setPin] = useState("");
	const [notes, setNotes] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
	const [username, setUsername] = useState("");

	useEffect(() => { setPassword(onboardingSettings.defaultPassword); }, [onboardingSettings.defaultPassword]);

	/* ── Load application data ── */
	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("*")
			.filter("raw->>registrationNumber", "eq", registrationNumber)
			.maybeSingle()
			.then(({ data, error }) => {
				if (error) {
					console.error("[ApplicationDetail] Query error:", error);
					toast.error("Gagal memuat data: " + error.message);
				}
				if (data) {
					setApp(data);
					setPin(generateSixDigitPin(data.full_name + data.id));
					setNotes(data.review_notes ?? "");
					setUsername(data.employment?.username || data.email || `${data.id}@djiwatentram.local`);
				} else {
					setNotFound(true);
				}
				setIsLoading(false);
			});
	}, [registrationNumber]);

	/* ── Download PDF ── */
	async function downloadContractPdf() {
		if (!app) return;
		setIsDownloadingPdf(true);
		try {
			const pdf = new jsPDF("p", "mm", "a4");
			const pw = pdf.internal.pageSize.getWidth();
			const ph = pdf.internal.pageSize.getHeight();
			const m = 15;
			const uw = pw - m * 2;
			let y = m;

			function addWrappedText(text: string, fontSize = 10, style: "normal" | "bold" = "normal", align: "left" | "center" = "left") {
				pdf.setFont("helvetica", style);
				pdf.setFontSize(fontSize);
				for (const ln of pdf.splitTextToSize(String(text || ""), uw) as string[]) {
					if (y + fontSize * 0.45 > ph - m) { pdf.addPage(); y = m; }
					pdf.text(ln, align === "center" ? pw / 2 : m, y, { align });
					y += fontSize * 0.45 + 1.5;
				}
			}

			addWrappedText(companyDisplayName, 10, "bold", "center");
			addWrappedText(app.contract?.title || "Perjanjian Kerja", 16, "bold", "center");
			y += 2;
			pdf.setDrawColor(180);
			pdf.line(m, y, pw - m, y);
			y += 6;

			const bodyText = app.contract?.plainText ||
				(app.contract?.clauses ?? []).map((c: any) => `${c.title}\n${c.body}`).join("\n\n");

			for (const paragraph of String(bodyText || "").split(/\n+/)) {
				const trimmed = paragraph.trim();
				if (!trimmed) { y += 2; continue; }
				addWrappedText(trimmed, 10);
				y += 1;
			}

			if (y > ph - 55) { pdf.addPage(); y = m; }
			y += 8;
			const cw = uw / 2 - 6;
			pdf.setFontSize(9);
			pdf.setFont("helvetica", "normal");
			pdf.text("Pihak Perusahaan", m, y);
			pdf.text("Karyawan", m + cw + 12, y);
			y += 28;
			pdf.setDrawColor(180);
			pdf.line(m, y, m + cw, y);
			pdf.line(m + cw + 12, y, m + cw + 12 + cw, y);
			y += 5;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(10);
			pdf.text(signatoryPersonName || companyDisplayName, m, y);
			pdf.text(app.full_name || "Karyawan", m + cw + 12, y);

			const safeName = (app.full_name || "kontrak").replace(/\s+/g, "-").toLowerCase();
			pdf.save(`kontrak-${safeName}.pdf`);
			toast.success("PDF kontrak berhasil diunduh");
		} catch (e: any) { toast.error(e?.message || "Gagal mengunduh PDF"); }
		finally { setIsDownloadingPdf(false); }
	}

	/* ── Approve ── */
	async function handleApprove() {
		if (!app) return;
		if (app.status === "approved" || app.approved_user_source_id) {
			toast.info("Pendaftaran ini sudah disetujui.");
			return;
		}
		if (!pin || pin.length !== 6) {
			toast.error("PIN harus 6 digit");
			return;
		}
		if (onboardingSettings.approvalPreview.requireConfirmation && !window.confirm(`Approve ${app.full_name} dan buat akun user?`)) return;
		setIsSaving(true);
		try {
			const approvalStartDate = new Date().toISOString().slice(0, 10);
			const employment = { ...(app.employment ?? {}), startDate: approvalStartDate };
			await approveApp({
				applicationId: app.id,
				username: username || app.employment?.username || app.email || `${app.id}@djiwatentram.local`,
				password,
				name: app.full_name,
				roleId: employment.roleId,
				homePin: pin || undefined,
				requiresPinChange: true,
				slug: employment.slug,
				receiveReportEmails: false,
				onboardingApplicationId: app.id,
				reviewNotes: notes || undefined,
				employment,
			});
			toast.success("Pendaftaran disetujui & user dibuat");
			triggerHybridRefresh();
			// Reload page to reflect new status
			window.location.reload();
		} catch (e: any) { toast.error(e?.message || "Gagal approve"); }
		finally { setIsSaving(false); }
	}

	/* ── Reject ── */
	async function handleReject() {
		if (!app) return;
		setIsSaving(true);
		try {
			await rejectApp({ id: app.id, reviewNotes: notes || undefined });
			toast.success("Pendaftaran ditolak");
			window.location.reload();
		} catch (e: any) { toast.error(e?.message || "Gagal update status"); }
		finally { setIsSaving(false); }
	}

	/* ── Mark revision ── */
	async function handleMarkRevision() {
		if (!app) return;
		setIsSaving(true);
		try {
			await markRevision({ id: app.id, reviewNotes: notes || undefined });
			toast.success("Ditandai perlu revisi");
			window.location.reload();
		} catch (e: any) { toast.error(e?.message || "Gagal update status"); }
		finally { setIsSaving(false); }
	}

	/* ── Delete ── */
	async function handleDelete() {
		if (!app) return;
		if (!window.confirm(`Hapus pendaftaran "${app.full_name}"? Aksi ini tidak bisa dibatalkan.`)) return;
		setIsDeleting(true);
		try {
			await deleteApp(app.id);
			toast.success("Pendaftaran dihapus");
			navigate({ to: "/admin/operational-team/register/onboarding" as any });
		} catch (e: any) { toast.error(e?.message || "Gagal menghapus"); }
		finally { setIsDeleting(false); }
	}

	/* ── Loading state ── */
	if (isLoading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">Memuat data pendaftaran...</p>
				</div>
			</div>
		);
	}

	/* ── Not found ── */
	if (notFound || !app) {
		return (
			<div className="mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-12">
				<Card className="mx-auto max-w-md text-center">
					<CardContent className="space-y-4 px-6 py-10">
						<XCircle className="mx-auto h-12 w-12 text-amber-500" />
						<h2 className="text-lg font-bold">Pendaftaran Tidak Ditemukan</h2>
						<p className="text-sm text-muted-foreground">
							Tidak ada pendaftaran dengan nomor <b>{registrationNumber}</b>.
						</p>
						<Button variant="outline" onClick={() => navigate({ to: "/admin/operational-team/register/onboarding" as any })}>
							<ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	/* ── Main render ── */
	const isApproved = app.status === "approved" && app.approved_user_source_id;

	return (
		<div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6 sm:space-y-6">

			{/* ── Header ── */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/admin/operational-team/register/onboarding" as any })} className="h-8 w-8 shrink-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<div className="flex items-center gap-2">
							<Badge variant="secondary" className="mb-0.5">
								<FileSignature className="mr-1 h-3 w-3" /> Detail Pendaftaran
							</Badge>
							<Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-xs">
								{app.status}
							</Badge>
							{app.raw?.pipelineStep === "contract_signed" && (
								<Badge variant="default" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
									Kontrak Ditandatangani ✅
								</Badge>
							)}
							{app.status === "approved" && app.raw?.pipelineStep !== "contract_signed" && (
								<Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
									Menunggu Tanda Tangan
								</Badge>
							)}
						</div>
						<h1 className="text-xl font-bold sm:text-2xl">{app.full_name}</h1>
						<p className="text-xs text-muted-foreground">
							{app.employment?.roleName || "-"} &middot; {registrationNumber}
						</p>
					</div>
				</div>
			</div>

			{/* ── Status banner ── */}
			{isApproved && app.raw?.pipelineStep === "contract_signed" && (
				<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<CheckCircle2 className="h-5 w-5 text-emerald-600" />
						<span>✓ Kontrak sudah ditandatangani</span>
					</div>
					<div className="mt-2 flex items-center gap-2">
						{app.contract_pdf_url && (
							<a href={app.contract_pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 transition-colors">
								<Download className="h-3.5 w-3.5" /> Unduh PDF Kontrak
							</a>
						)}
						<a href="/register/selesai/${app.raw?.registrationNumber}" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
							<Eye className="h-3.5 w-3.5" /> Lihat Halaman Kandidat
						</a>
					</div>
				</div>
			)}
			{isApproved && app.raw?.pipelineStep !== "contract_signed" && (
				<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<CheckCircle2 className="h-5 w-5 text-emerald-600" />
						<span>✓ Pendaftaran sudah disetujui</span>
					</div>
					<p className="mt-1 text-xs text-emerald-600">
						Akun sudah dibuat. Menunggu kandidat menandatangani kontrak.
					</p>
				</div>
			)}
			{app.status === "rejected" && (
				<div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<XCircle className="h-5 w-5 text-red-600" />
						<span>✕ Pendaftaran ditolak</span>
					</div>
					{app.review_notes && <p className="mt-1 text-xs text-red-600">Alasan: {app.review_notes}</p>}
				</div>
			)}

			{/* ── Data sections (2-column on desktop) ── */}
			<div className="grid gap-4 md:grid-cols-[1fr_1.4fr] md:gap-6">

				{/* ── LEFT: Data + Actions ── */}
				<div className="space-y-3">

					{/* Data Diri */}
					<div className="rounded-lg border bg-card p-3 sm:p-4">
						<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							<UserPlus className="h-3.5 w-3.5" /> Data Diri
						</h4>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
							<InfoRow label="HP" value={app.phone} />
							<InfoRow label="Email" value={app.email || "-"} />
							<InfoRow label="NIK" value={app.identity_number || "-"} />
							<InfoRow label="Tgl Lahir" value={app.birth_date ? new Date(app.birth_date).toLocaleDateString("id-ID") : "-"} />
							<div className="col-span-2">
								<InfoRow label="Alamat" value={app.address || "-"} />
							</div>
							{app.cv_url && (
								<div className="col-span-2 mt-1">
									<a
										href={app.cv_url}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
									>
										<Eye className="h-3.5 w-3.5" />
										Lihat CV
									</a>
								</div>
							)}
						</div>
					</div>

					{/* Data Kerja */}
					<div className="rounded-lg border bg-card p-3 sm:p-4">
						<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							<FileText className="h-3.5 w-3.5" /> Data Kerja
						</h4>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
							<InfoRow label="Role" value={app.employment?.roleName} />
							<InfoRow label="Tipe" value={app.employment?.employmentType || "-"} />
							<InfoRow label="Username" value={app.employment?.username} />
							<InfoRow label="Slug" value={app.employment?.slug || "-"} />
							<InfoRow label="Gaji Pokok" value={formatOnboardingCurrency(app.employment?.monthlySalary)} />
							<InfoRow label="T. Transport" value={formatOnboardingCurrency(app.employment?.dailyAllowance)} />
							<InfoRow label="Rate Shift" value={formatOnboardingCurrency(app.employment?.shiftRate)} />
							<InfoRow label="Estimasi/bln" value={formatOnboardingCurrency(
								calculateEstimatedMonthlySalary(app.employment ?? {})
							)} highlight />
							<InfoRow label="Durasi" value={
								app.employment?.contractDuration
									? `${app.employment.contractDuration} bulan`
									: "-"
							} />
							<InfoRow label="Lokasi" value={app.employment?.location || "Djiwa Tentram"} />
						</div>
					</div>

					{/* Form: only show if not already approved */}
					{!isApproved && (
						<>
							{/* Preview Akun */}
							{onboardingSettings.approvalPreview.enabled && (
								<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
									<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
										<ShieldCheck className="h-3.5 w-3.5" /> Preview Akun
									</h4>
									<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
										<InfoRow label="Nama" value={app.full_name} />
										<InfoRow label="Username" value={username || "-"} />
										<InfoRow label="Slug" value={app.employment?.slug || "-"} />
										<InfoRow label="PIN" value={pin || "isi 6 digit"} />
										<InfoRow label="Role" value={app.employment?.roleName || "-"} />
										<InfoRow label="Mulai" value="Tanggal approval" />
									</div>
								</div>
							)}

							{/* Konfigurasi Akun */}
							<div className="rounded-lg border bg-card p-3 sm:p-4">
								<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									<ShieldCheck className="h-3.5 w-3.5" /> Konfigurasi Akun
								</h4>
								<div className="space-y-2.5">
									<div className="grid grid-cols-2 gap-2.5">
										<Field label="Username">
											<Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-8 text-xs" placeholder="username untuk login" />
										</Field>
										<Field label="Password awal">
											<Input value={password} onChange={(e) => setPassword(e.target.value)} className="h-8 text-xs" />
										</Field>
										<Field label="PIN 6 digit">
											<Input maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="h-8 text-xs" />
										</Field>
									</div>
									<Field label="Catatan review">
										<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] text-xs" placeholder="Tambahkan catatan untuk karyawan..." />
									</Field>
								</div>
							</div>
						</>
					)}

					{/* Already approved: show review notes */}
					{isApproved && app.review_notes && (
						<div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
							<h4 className="mb-1 text-xs font-semibold text-muted-foreground">Catatan review</h4>
							<p className="text-xs">{app.review_notes}</p>
						</div>
					)}
				</div>

				{/* ── RIGHT: Contract + Signatures ── */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							<FileSignature className="h-3.5 w-3.5" /> Kontrak Kerja
						</h3>
						<Button size="sm" variant="outline" onClick={downloadContractPdf} disabled={isDownloadingPdf} type="button" className="h-8 gap-1.5 px-3 text-xs font-medium">
							{isDownloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
							Unduh PDF
						</Button>
					</div>
					<div className="max-h-[520px] overflow-y-auto rounded-xl border bg-white shadow-sm">
						<ContractPreview
							contract={app.contract}
							employeeName={app.full_name}
							signatureDataUrl={app.signature_url}
							companyName={companyDisplayName}
							signatoryName={signatoryPersonName}
							signatorySignatureUrl={onboardingSettings.signatorySignatureUrl}
						/>
					</div>
				</div>
			</div>

			{/* ── Action buttons ── */}
			<Separator />
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					{!isApproved && (
						<Button disabled={isSaving || !pin || pin.length !== 6} size="sm" onClick={handleApprove} className="gap-1.5">
							<CheckCircle2 className="h-4 w-4" />Approve & Buat User
						</Button>
					)}
					{!isApproved && (
						<Button disabled={isSaving} size="sm" variant="destructive" onClick={handleReject} className="gap-1.5">
							<XCircle className="h-4 w-4" />Tolak
						</Button>
					)}
					{!isApproved && (
						<Button disabled={isSaving} size="sm" variant="outline" onClick={handleMarkRevision} className="gap-1.5">
							<FileText className="h-4 w-4" />Minta Revisi
						</Button>
					)}
				</div>
				<Button disabled={isDeleting} size="sm" variant="outline" onClick={handleDelete} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10">
					<Trash2 className="h-4 w-4" />Hapus Pendaftaran
				</Button>
			</div>
		</div>
	);
}

/* -------- helpers -------- */
function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="whitespace-nowrap text-muted-foreground">{label}:</span>
			<span className={`truncate text-right font-medium ${highlight ? "text-emerald-600" : "text-foreground"}`}>{value ?? "-"}</span>
		</div>
	);
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
	return (
		<div className={`space-y-1.5 sm:space-y-2 ${className ?? ""}`}>
			<Label className="text-xs sm:text-sm">{label}</Label>
			{children}
		</div>
	);
}

export const Route = createLazyFileRoute(
	"/admin/operational-team/register/application/$registrationNumber" as any
)({
	component: ApplicationDetailPage,
});
