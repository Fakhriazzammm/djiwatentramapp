import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileSignature, ShieldCheck, Trash2, XCircle } from "lucide-react";
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
import { useHybridCreateUser, useHybridUpdateEmployeeApplicationStatus } from "@/hooks/use-employee-onboarding-actions";
import { calculateEstimatedMonthlySalary } from "@/lib/employee-onboarding-schema";
import { formatOnboardingCurrency, normalizeEmployeeOnboardingSettings, calculateProbationEndDate } from "@/lib/employee-onboarding-settings";

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
	const createUser = useHybridCreateUser();
	const updateStatus = useHybridUpdateEmployeeApplicationStatus();

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
			const supabase = createClient();
			const { error } = await supabase.from("employee_onboarding_applications").delete().eq("id", id);
			if (error) throw error;
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
			const supabase = createClient();
			const ids = Array.from(selectedIds);
			const { error } = await supabase.from("employee_onboarding_applications").delete().in("id", ids);
			if (error) throw error;
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
	useEffect(() => { setPassword(onboardingSettings.defaultPassword); }, [onboardingSettings.defaultPassword]);

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
			const employment = app.employment ?? {};
			const createdUserId = await createUser({
				username: employment.username || app.email || `${app.id}@djiwatentram.local`,
				password,
				name: app.full_name,
				roleId: employment.roleId,
				homePin: pin || undefined,
				requiresPinChange: pin === "696969",
				slug: employment.slug,
				receiveReportEmails: false,
				onboardingApplicationId: app.id,
			});
			await updateStatus({ id: app.id, status: "approved", approvedUserSourceId: createdUserId, reviewNotes: notes });
			toast.success("Pendaftaran disetujui & user dibuat"); triggerHybridRefresh();
			closeDialog();
		} catch (e: any) { toast.error(e?.message || "Gagal approve"); }
		finally { setIsSaving(false); }
	}

	async function markStatus(app: any, s: "rejected" | "needs_revision") {
		setIsSaving(true);
		try {
			await updateStatus({ id: app.id, status: s, reviewNotes: notes });
			toast.success(s === "rejected" ? "Pendaftaran ditolak" : "Ditandai perlu revisi");
			closeDialog();
		} catch (e: any) { toast.error(e?.message || "Gagal update status"); }
		finally { setIsSaving(false); }
	}

	function openDialog(app: any) {
		setSelected(app);
		setPassword(onboardingSettings.defaultPassword);
		setPin("696969");
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
				</div>
				<div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
					<Stat label="Pending" value={stats.pending} />
					<Stat label="Approved" value={stats.approved} />
					<Stat label="Revisi" value={stats.revision} />
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
						<p className="px-4 py-10 text-center text-muted-foreground text-sm">Belum ada pendaftaran.</p>
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
											<th className="p-3">Role</th>
											<th className="p-3 hidden md:table-cell">Kontak</th>
											<th className="p-3 hidden md:table-cell">Tanggal</th>
											<th className="p-3">Status</th>
											<th className="p-3 text-right">Aksi</th>
										</tr>
									</thead>
									<tbody className="divide-y">
										{applications.map((app: any) => (
											<tr key={app.id} className="hover:bg-muted/30">
												<td className="p-3">
													<Checkbox checked={selectedIds.has(String(app.id))} onCheckedChange={() => toggleSelect(String(app.id))} />
												</td>
												<td className="p-3 font-medium">{app.full_name}</td>
												<td className="p-3">{app.employment?.roleName ?? "-"}</td>
												<td className="p-3 hidden md:table-cell">{app.phone}<br /><span className="text-muted-foreground">{app.email}</span></td>
												<td className="p-3 hidden md:table-cell text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</td>
												<td className="p-3"><Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-xs">{app.status}</Badge></td>
												<td className="p-3 text-right">
													<div className="flex items-center justify-end gap-1.5">
														<Button size="sm" variant="outline" onClick={() => openDialog(app)} className="h-8 px-2.5 text-xs">
															<Eye className="mr-1 h-3.5 w-3.5" />Review
														</Button>
														<Button size="sm" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteSingle(String(app.id), app.full_name)} disabled={isDeleting}>
															<Trash2 className="h-3.5 w-3.5" />
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
											<Button size="sm" variant="outline" onClick={() => openDialog(app)} className="h-8 flex-1 text-xs">
												<Eye className="mr-1.5 h-3.5 w-3.5" />Review
											</Button>
											<Button size="sm" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteSingle(String(app.id), app.full_name)} disabled={isDeleting}>
												<Trash2 className="h-3.5 w-3.5" />
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
				<DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-h-[90vh] sm:max-w-4xl">
					{selected && (
						<div className="space-y-4 sm:space-y-5">
							<div>
								<DialogTitle className="text-base sm:text-lg">Review {selected.full_name}</DialogTitle>
								<DialogDescription className="text-xs sm:text-sm">
									Periksa data, kontrak, dan tanda tangan sebelum approve.
								</DialogDescription>
							</div>

							<div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
								<Card className="border">
									<CardHeader className="pb-1 sm:pb-2"><CardTitle className="text-sm sm:text-base">Data Diri</CardTitle></CardHeader>
									<CardContent className="space-y-1.5 text-xs sm:space-y-2 sm:text-sm">
										<p><b>HP:</b> {selected.phone}</p>
										<p><b>Email:</b> {selected.email || "-"}</p>
										<p><b>NIK:</b> {selected.identity_number || "-"}</p>
										<p><b>Alamat:</b> {selected.address || "-"}</p>
									</CardContent>
								</Card>
								<Card className="border">
									<CardHeader className="pb-1 sm:pb-2"><CardTitle className="text-sm sm:text-base">Data Kerja</CardTitle></CardHeader>
									<CardContent className="space-y-1.5 text-xs sm:space-y-2 sm:text-sm">
										<p><b>Role:</b> {selected.employment?.roleName}</p>
										<p><b>Mulai:</b> {selected.employment?.startDate}</p>
										{selected.employment?.employmentType === "probation" && (() => {
											const endDate = calculateProbationEndDate(selected.employment?.startDate, onboardingSettings.probation.defaultMonths);
											return endDate ? <p><b>Probation berakhir:</b> <span className="text-amber-600 font-semibold">{new Date(endDate).toLocaleDateString("id-ID")}</span></p> : null;
										})()}
										<p><b>Username:</b> {selected.employment?.username}</p>
										<p><b>PIN login:</b> Dibuat admin saat approval</p>
										<p><b>Gaji:</b> {formatOnboardingCurrency(selected.employment?.monthlySalary)} {(() => {
											const est = calculateEstimatedMonthlySalary(selected.employment ?? {});
											const base = selected.employment?.monthlySalary ?? 0;
											if (est > 0 && est !== base) {
												return <span className="text-muted-foreground">(estimasi {formatOnboardingCurrency(est)}/bulan)</span>;
											}
											return null;
										})()}</p>
										<p><b>Tunjangan transportasi:</b> {formatOnboardingCurrency(selected.employment?.dailyAllowance)}</p>
										<p><b>Rate shift:</b> {formatOnboardingCurrency(selected.employment?.shiftRate)}</p>
										<p><b>Status:</b> {selected.raw?.pipelineStatus ?? "submitted"}</p>
									</CardContent>
								</Card>
							</div>

							{onboardingSettings.approvalPreview.enabled && (
								<Card className="border-primary/30 bg-primary/5">
									<CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Preview Akun Sebelum Approve</CardTitle></CardHeader>
									<CardContent className="grid gap-2 text-xs sm:grid-cols-2">
										<p><b>Nama:</b> {selected.full_name}</p><p><b>Username:</b> {selected.employment?.username || selected.email || `${selected.id}@djiwatentram.local`}</p><p><b>Slug:</b> {selected.employment?.slug || "-"}</p><p><b>PIN:</b> {pin || "isi 6 digit"}</p><p><b>Role:</b> {selected.employment?.roleName || "-"}</p><p><b>Mulai:</b> {selected.employment?.startDate || "-"}</p>
									</CardContent>
								</Card>
							)}
							<ContractPreview contract={selected.contract} employeeName={selected.full_name} signatureDataUrl={selected.signature_url} signatoryName={onboardingSettings.signatoryName} signatorySignatureUrl={onboardingSettings.signatorySignatureUrl} />

							<div className="grid gap-3 sm:grid-cols-3">
								<Field label="Password awal"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
								<Field label="PIN 6 digit"><Input maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>
								<Field label="Catatan review" className="sm:col-span-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
							</div>

							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
								<Button disabled={isSaving} size="sm" variant="outline" onClick={() => markStatus(selected, "needs_revision")}>Minta Revisi</Button>
								<Button disabled={isSaving} size="sm" variant="destructive" onClick={() => markStatus(selected, "rejected")}>
									<XCircle className="mr-1.5 h-4 w-4" />Tolak
								</Button>
								<Button disabled={isSaving || !pin || pin.length !== 6} size="sm" onClick={() => approveApplication(selected)} className="sm:order-first sm:mr-auto">
									<CheckCircle2 className="mr-1.5 h-4 w-4" />Approve & Buat User
								</Button>
							</div>
						</div>
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

export const Route = createLazyFileRoute("/admin/onboarding" as any)({ component: AdminOnboardingPage });
