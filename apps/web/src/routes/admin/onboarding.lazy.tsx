import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Eye, FileSignature, FileText, Loader2, PencilLine, PlusCircle, ShieldCheck, Trash2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridApproveApplication, useHybridRejectApplication, useHybridMarkRevision, useHybridDeleteApplication, useHybridBulkDeleteApplications } from "@/hooks/use-employee-onboarding-actions";
import { calculateEstimatedMonthlySalary } from "@/lib/employee-onboarding-schema";
import { formatOnboardingCurrency, generateSixDigitPin, normalizeEmployeeOnboardingSettings, calculateProbationEndDate } from "@/lib/employee-onboarding-settings";
import { jsPDF } from "jspdf";

/* -------- helpers -------- */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	approved: "default",
	pending: "secondary",
	rejected: "destructive",
	needs_revision: "outline",
};

/* -------- page -------- */
export function AdminOnboardingPage() {
	const [applications, setApplications] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isDeleting, setIsDeleting] = useState(false);
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
	const companyDisplayName = String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || onboardingSettings.signatoryName || "Djiwa Tentram").trim();
	const signatoryPersonName = onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName;
	const approveApp = useHybridApproveApplication();
	const rejectApp = useHybridRejectApplication();
	const markRevision = useHybridMarkRevision();
	const deleteApp = useHybridDeleteApplication();
	const bulkDeleteApps = useHybridBulkDeleteApplications();

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("*")
			.order("created_at", { ascending: false })
			.then(({ data, error }) => {
				if (error) {
					console.error("[Onboarding] Query error:", error);
					toast.error("Gagal memuat data pendaftaran: " + error.message);
				}
				if (data) setApplications(data as any[]);
				setIsLoading(false);
			});
	}, []);

	function refreshApplications() {
		setIsLoading(true);
		setSelectedIds(new Set());
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("*")
			.order("created_at", { ascending: false })
			.then(({ data, error }) => {
				if (error) {
					console.error("[Onboarding] Refresh error:", error);
					toast.error("Gagal refresh: " + error.message);
				}
				if (data) {
					setApplications(data as any[]);
					toast.success(`Data dimuat: ${data.length} pendaftaran`);
				}
				setIsLoading(false);
			});
	}

	/* ---- selection ---- */
	const allSelected = applications.length > 0 && selectedIds.size === applications.length;
	const someSelected = selectedIds.size > 0 && selectedIds.size < applications.length;

	function toggleSelectAll() {
		if (allSelected) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(applications.map((a) => String(a.id))));
		}
	}

	function toggleSelect(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	async function deleteSingle(id: string, name: string) {
		if (!window.confirm(`Hapus pendaftaran "${name}"? Aksi ini tidak bisa dibatalkan.`)) return;
		setIsDeleting(true);
		try {
			await deleteApp(id);
			setApplications((prev) => prev.filter((a) => String(a.id) !== id));
			setSelectedIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			toast.success(`Pendaftaran "${name}" dihapus`);
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus pendaftaran");
		} finally {
			setIsDeleting(false);
		}
	}

	async function deleteBulk() {
		if (selectedIds.size === 0) return;
		if (!window.confirm(`Hapus ${selectedIds.size} pendaftaran terpilih? Aksi ini tidak bisa dibatalkan.`)) return;
		setIsDeleting(true);
		try {
			const ids = Array.from(selectedIds);
			await bulkDeleteApps(ids);
			setApplications((prev) => prev.filter((a) => !selectedIds.has(String(a.id))));
			toast.success(`${selectedIds.size} pendaftaran dihapus`);
			setSelectedIds(new Set());
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus pendaftaran");
		} finally {
			setIsDeleting(false);
		}
	}

	const [selected, setSelected] = useState<any | null>(null);
	const [password, setPassword] = useState(onboardingSettings.defaultPassword);
	const [pin, setPin] = useState("");
	const [notes, setNotes] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
	useEffect(() => { setPassword(onboardingSettings.defaultPassword); }, [onboardingSettings.defaultPassword]);

	async function downloadContractPdf() {
		if (!selected) return;
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
			addWrappedText(selected.contract?.title || "Perjanjian Kerja", 16, "bold", "center");
			y += 2;
			pdf.setDrawColor(180);
			pdf.line(m, y, pw - m, y);
			y += 6;

			const bodyText = selected.contract?.plainText ||
				(selected.contract?.clauses ?? []).map((c: any) => `${c.title}\n${c.body}`).join("\n\n");

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
			pdf.text(selected.full_name || "Karyawan", m + cw + 12, y);

			const safeName = (selected.full_name || "kontrak").replace(/\s+/g, "-").toLowerCase();
			pdf.save(`kontrak-${safeName}.pdf`);
			toast.success("PDF kontrak berhasil diunduh");
		} catch (e: any) { toast.error(e?.message || "Gagal mengunduh PDF"); }
		finally { setIsDownloadingPdf(false); }
	}

	const stats = useMemo(
		() => ({
			pending: applications.filter((a: any) => a.status === "pending").length,
			approved: applications.filter((a: any) => a.status === "approved").length,
			revision: applications.filter((a: any) => a.status === "needs_revision").length,
		}),
		[applications],
	);

	/* ---- actions ---- */
	async function approveApplication(app: any) {
		if (app.status === "approved" || app.approved_user_source_id) {
			toast.info("Pendaftaran ini sudah disetujui dan user sudah dibuat.");
			return;
		}
		if (onboardingSettings.approvalPreview.requireConfirmation && !window.confirm(`Approve ${app.full_name} dan buat akun user?`)) return;
		setIsSaving(true);
		try {
			const approvalStartDate = new Date().toISOString().slice(0, 10);
			const employment = { ...(app.employment ?? {}), startDate: approvalStartDate };
			await approveApp({
				applicationId: app.id,
				username: employment.username || app.email || `${app.id}@djiwatentram.local`,
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
			toast.success("Pendaftaran disetujui & user dibuat"); triggerHybridRefresh();
			closeDialog();
		} catch (e: any) { toast.error(e?.message || "Gagal approve"); }
		finally { setIsSaving(false); }
	}

	async function markStatus(app: any, s: "rejected" | "needs_revision") {
		setIsSaving(true);
		try {
			if (s === "rejected") {
				await rejectApp({ id: app.id, reviewNotes: notes || undefined });
			} else {
				await markRevision({ id: app.id, reviewNotes: notes || undefined });
			}
			toast.success(s === "rejected" ? "Pendaftaran ditolak" : "Ditandai perlu revisi");
			closeDialog();
		} catch (e: any) { toast.error(e?.message || "Gagal update status"); }
		finally { setIsSaving(false); }
	}

	function openDialog(app: any) {
		setSelected(app);
		setPassword(onboardingSettings.defaultPassword);
		setPin(generateSixDigitPin(app.full_name + app.id));
		setNotes(app.review_notes ?? "");
	}
	function closeDialog() {
		setSelected(null);
		setPin("");
		setNotes("");
	}

	/* ---- render ---- */
	return (
		<div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6 sm:space-y-6">
			{/* ---- header ---- */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Badge variant="secondary" className="mb-2">
						<FileSignature className="mr-1 h-3 w-3" /> Onboarding Karyawan
					</Badge>
					<h1 className="text-xl font-bold sm:text-3xl">Review Register Karyawan</h1>
					<p className="mt-1 text-muted-foreground text-xs sm:text-sm">
						Approve pendaftaran dari halaman publik /register.
					</p>
					{/* ── CRUD icon badges ── */}
					<div className="mt-2 flex flex-wrap gap-1.5">
						<Badge variant="outline" className="gap-1.5 border-sky-300 bg-sky-50 text-sky-700 text-[11px] font-semibold px-2.5 py-1">
							<PlusCircle className="h-4 w-4" /> Create
						</Badge>
						<Badge variant="outline" className="gap-1.5 border-blue-300 bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-1">
							<Eye className="h-4 w-4" /> Read
						</Badge>
						<Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 text-[11px] font-semibold px-2.5 py-1">
							<PencilLine className="h-4 w-4" /> Update
						</Badge>
						<Badge variant="outline" className="gap-1.5 border-red-300 bg-red-50 text-red-700 text-[11px] font-semibold px-2.5 py-1">
							<Trash2 className="h-4 w-4" /> Delete
						</Badge>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<Button size="sm" variant="default" onClick={() => window.open("/register", "_blank")} className="gap-1.5">
						<PlusCircle className="h-4 w-4" /> Tambah Pendaftaran
					</Button>
					<div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
					<Stat label="Pending" value={stats.pending} />
					<Stat label="Approved" value={stats.approved} />
					<Stat label="Revisi" value={stats.revision} />
				</div>
			</div>
		</div>

			{/* ---- list ---- */}
			<Card className="border sm:rounded-xl">
				<CardHeader className="pb-2 sm:pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="text-base sm:text-lg">Daftar Pendaftaran</CardTitle>
					<div className="flex items-center gap-2">
						{selectedIds.size > 0 && (
							<Button
								size="sm"
								variant="destructive"
								disabled={isDeleting}
								onClick={deleteBulk}
							>
								<Trash2 className="mr-1.5 h-3.5 w-3.5" />
								Hapus {selectedIds.size} terpilih
							</Button>
						)}
						<Button size="sm" variant="outline" onClick={refreshApplications} disabled={isLoading}>
							{isLoading ? "Memuat..." : "Refresh"}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="px-0 sm:px-6">
					{applications.length === 0 ? (
						<div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
							<UserPlus className="h-12 w-12 text-muted-foreground/40" />
							<p className="text-muted-foreground text-sm">Belum ada pendaftaran.</p>
							<Button size="sm" variant="outline" onClick={() => window.open("/register", "_blank")} className="gap-1.5">
								<PlusCircle className="h-4 w-4" /> Buat Pendaftaran Baru
							</Button>
						</div>
					) : (
						<>
							{/* ---- desktop table ---- */}
							<div className="hidden overflow-x-auto rounded-xl border sm:block">
								<table className="w-full text-left text-sm">
									<thead className="bg-muted/50 text-muted-foreground">
										<tr>
											<th className="p-3 w-10">
												<Checkbox checked={allSelected} data-state={someSelected ? "indeterminate" : undefined} onCheckedChange={toggleSelectAll} />
											</th>
											<th className="p-3">Nama</th>
											<th className="p-3 hidden md:table-cell">Kontak</th>
											<th className="p-3 hidden md:table-cell">Tanggal</th>
											<th className="p-3">Status</th>
												<th className="p-3 text-right">
													<span className="inline-flex items-center gap-1.5">
														<Eye className="h-3.5 w-3.5 text-blue-500" />
														<PencilLine className="h-3.5 w-3.5 text-amber-500" />
														<Trash2 className="h-3.5 w-3.5 text-red-500" />
													</span>
												</th>
										</tr>
									</thead>
									<tbody className="divide-y">
										{applications.map((app: any) => (
											<tr key={app.id} className="hover:bg-muted/30">
												<td className="p-2 sm:p-3">
													<Checkbox checked={selectedIds.has(String(app.id))} onCheckedChange={() => toggleSelect(String(app.id))} />
												</td>
												<td className="p-2 sm:p-3 font-medium">{app.full_name}
													{app.employment?.roleName && <span className="block text-[11px] text-muted-foreground">{app.employment.roleName}</span>}
												</td>
												<td className="p-2 sm:p-3 hidden md:table-cell text-xs text-muted-foreground">{app.phone}
													{app.email && <span className="block truncate">{app.email}</span>}
												</td>
												<td className="p-2 sm:p-3 hidden md:table-cell text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</td>
												<td className="p-2 sm:p-3"><Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-[10px]">{app.status}</Badge></td>
												<td className="p-2 sm:p-3 text-right">
													<div className="flex items-center justify-end gap-1">
														<Button size="sm" variant="outline" onClick={() => openDialog(app)} className="h-9 min-w-[4.5rem] gap-1.5 px-2.5 text-xs font-medium" title="Lihat & Edit">
															<Eye className="h-4 w-4 text-blue-500" />
															<span className="hidden sm:inline">Review</span>
															<PencilLine className="h-4 w-4 text-amber-500" />
														</Button>
														<Button size="sm" variant="outline" className="h-9 w-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteSingle(String(app.id), app.full_name)} disabled={isDeleting} title="Hapus">
															<Trash2 className="h-5 w-5" />
														</Button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							{/* ---- mobile cards ---- */}
							<div className="flex flex-col gap-2 px-3 sm:hidden">
								{applications.map((app: any) => (
									<div key={app.id} className="rounded-xl border p-3 space-y-2">
										<div className="flex items-start justify-between gap-2">
											<div className="flex items-center gap-2">
												<Checkbox checked={selectedIds.has(String(app.id))} onCheckedChange={() => toggleSelect(String(app.id))} />
												<div>
													<div className="font-medium text-sm">{app.full_name}</div>
													<div className="text-muted-foreground text-xs">{app.employment?.roleName ?? "-"}</div>
												</div>
											</div>
											<Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-xs flex-shrink-0">{app.status}</Badge>
										</div>
										<div className="text-muted-foreground text-xs">{app.phone} &middot; {app.email}</div>
										<div className="text-muted-foreground text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</div>
										<div className="flex items-center gap-2">
											<Button size="sm" variant="outline" onClick={() => openDialog(app)} className="h-10 flex-1 gap-1.5 px-3 text-xs font-medium" title="Lihat & Edit">
												<Eye className="h-4 w-4 text-blue-500" />
												<span>Review</span>
												<PencilLine className="h-4 w-4 text-amber-500" />
											</Button>
											<Button size="sm" variant="outline" className="h-10 w-10 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteSingle(String(app.id), app.full_name)} disabled={isDeleting} title="Hapus">
												<Trash2 className="h-5 w-5" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* ---- review dialog ---- */}
			<Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) closeDialog(); }}>
				<DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-h-[90vh] sm:max-w-5xl">
					{selected && (
						<>
							<DialogTitle className="flex items-center gap-2 pr-10 text-base sm:text-lg">
								<UserPlus className="h-5 w-5 text-primary" />
								<span>Review Pendaftaran</span>
								<Badge variant={STATUS_VARIANT[selected.status] ?? "secondary"} className="ml-auto text-xs">
									{selected.status}
								</Badge>
							</DialogTitle>
							<DialogDescription className="text-xs sm:text-sm">
								{selected.full_name} &middot; {selected.employment?.roleName || "-"}
							</DialogDescription>

							<div className="grid gap-4 md:grid-cols-[1fr_1.4fr] md:gap-6">
								{/* ── LEFT: data + form ── */}
								<div className="space-y-3">

									{/* Data Diri — compact grid */}
									<div className="rounded-lg border bg-card p-3 sm:p-4">
										<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
											<UserPlus className="h-3.5 w-3.5" /> Data Diri
										</h4>
										<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
											<InfoRow label="HP" value={selected.phone} />
											<InfoRow label="Email" value={selected.email || "-"} />
											<InfoRow label="NIK" value={selected.identity_number || "-"} />
											<InfoRow label="Tgl Lahir" value={selected.birth_date ? new Date(selected.birth_date).toLocaleDateString("id-ID") : "-"} />
											<div className="col-span-2">
												<InfoRow label="Alamat" value={selected.address || "-"} />
											</div>
										</div>
									</div>

									{/* Data Kerja — compact grid */}
									<div className="rounded-lg border bg-card p-3 sm:p-4">
										<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
											<FileText className="h-3.5 w-3.5" /> Data Kerja
										</h4>
										<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
											<InfoRow label="Role" value={selected.employment?.roleName} />
											<InfoRow label="Tipe" value={selected.employment?.employmentType || "-"} />
											<InfoRow label="Username" value={selected.employment?.username} />
											<InfoRow label="Slug" value={selected.employment?.slug || "-"} />
											<InfoRow label="Gaji Pokok" value={formatOnboardingCurrency(selected.employment?.monthlySalary)} />
											<InfoRow label="T. Transport" value={formatOnboardingCurrency(selected.employment?.dailyAllowance)} />
											<InfoRow label="Rate Shift" value={formatOnboardingCurrency(selected.employment?.shiftRate)} />
											<InfoRow label="Estimasi/bln" value={formatOnboardingCurrency(
												calculateEstimatedMonthlySalary(selected.employment ?? {})
											)} highlight />
											<InfoRow label="Durasi" value={
												selected.employment?.contractDuration
													? `${selected.employment.contractDuration} bulan`
													: "-"
											} />
											<InfoRow label="Lokasi" value={selected.employment?.location || "Djiwa Tentram"} />
										</div>
									</div>

									{/* Preview Akun + Form */}
									{onboardingSettings.approvalPreview.enabled && (
										<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
											<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
												<ShieldCheck className="h-3.5 w-3.5" /> Preview Akun
											</h4>
											<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
												<InfoRow label="Nama" value={selected.full_name} />
												<InfoRow label="Username" value={selected.employment?.username || selected.email || `${selected.id}@djiwatentram.local`} />
												<InfoRow label="Slug" value={selected.employment?.slug || "-"} />
												<InfoRow label="PIN" value={pin || "isi 6 digit"} />
												<InfoRow label="Role" value={selected.employment?.roleName || "-"} />
												<InfoRow label="Mulai" value="Tanggal approval" />
											</div>
										</div>
									)}

									{/* Form fields */}
									<div className="rounded-lg border bg-card p-3 sm:p-4">
										<h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
											<ShieldCheck className="h-3.5 w-3.5" /> Konfigurasi Akun
										</h4>
										<div className="space-y-2.5">
											<div className="grid grid-cols-2 gap-2.5">
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
								</div>

								{/* ── RIGHT: contract preview ── */}
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
									<div className="max-h-[420px] overflow-y-auto rounded-xl border bg-white shadow-sm md:max-h-[520px]">
										<ContractPreview
											contract={selected.contract}
											employeeName={selected.full_name}
											signatureDataUrl={selected.signature_url}
											companyName={companyDisplayName}
											signatoryName={signatoryPersonName}
											signatorySignatureUrl={onboardingSettings.signatorySignatureUrl}
										/>
									</div>
								</div>
							</div>

							{/* ── Action buttons ── */}
							<div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-2">
								<Button disabled={isSaving} size="sm" variant="outline" onClick={() => markStatus(selected, "needs_revision")} className="gap-1.5">
									<FileText className="h-4 w-4" />Minta Revisi
								</Button>
								<Button disabled={isSaving} size="sm" variant="destructive" onClick={() => markStatus(selected, "rejected")} className="gap-1.5">
									<XCircle className="h-4 w-4" />Tolak
								</Button>
								<Button disabled={isSaving || !pin || pin.length !== 6} size="sm" onClick={() => approveApplication(selected)} className="gap-1.5 sm:mr-auto">
									<CheckCircle2 className="h-4 w-4" />Approve & Buat User
								</Button>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

/* -------- stat mini -------- */
function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border bg-card px-2 py-1.5 sm:rounded-xl sm:p-3">
			<div className="text-base font-bold sm:text-2xl">{value}</div>
			<div className="text-[10px] text-muted-foreground sm:text-xs">{label}</div>
		</div>
	);
}

/* -------- field helper -------- */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
	return (
		<div className={`space-y-1.5 sm:space-y-2 ${className ?? ""}`}>
			<Label className="text-xs sm:text-sm">{label}</Label>
			{children}
		</div>
	);
}

/* -------- info row helper -------- */
function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground whitespace-nowrap">{label}:</span>
			<span className={`truncate text-right font-medium ${highlight ? "text-emerald-600" : "text-foreground"}`}>{value ?? "-"}</span>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/onboarding" as any)({ component: AdminOnboardingPage });
