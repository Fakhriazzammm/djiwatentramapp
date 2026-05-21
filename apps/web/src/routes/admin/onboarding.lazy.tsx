import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, FileSignature, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { formatOnboardingCurrency, normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

/* -------- helpers -------- */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	approved: "default",
	pending: "secondary",
	rejected: "destructive",
	needs_revision: "outline",
};

/* -------- page -------- */
export function AdminOnboardingPage() {
	const navigate = useNavigate();
	const [applications, setApplications] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("*")
			.order("created_at", { ascending: false })
			.then(({ data, error }: { data: any; error: any }) => {
				if (!error && data) setApplications(data as any[]);
				setIsLoading(false);
			});
	}, []);

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [confirmModal, setConfirmModal] = useState<{
		isOpen: boolean;
		title: string;
		subtitle?: string;
		message: string;
		confirmText?: string;
		loading: boolean;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	}>({
		isOpen: false,
		title: "",
		message: "",
		loading: false,
		onConfirm: () => {},
	});
	const stats = useMemo(
		() => ({
			pending: applications.filter((a: any) => a.status === "pending").length,
			approved: applications.filter((a: any) => a.status === "approved").length,
			revision: applications.filter((a: any) => a.status === "needs_revision").length,
		}),
		[applications],
	);

	/* ---- actions ---- */
	function getAdminSecret() {
		return import.meta.env.VITE_ADMIN_SECRET || "";
	}

	async function cascadeDelete(ids: string[]) {
		if (ids.length === 0) return;
		const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
		const funcUrl = supabaseUrl + "/functions/v1/delete-employee-cascade";
		const res = await fetch(funcUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-admin-secret": getAdminSecret(),
			},
			body: JSON.stringify({ ids }),
		});
		const result = await res.json();
		if (!res.ok) throw new Error(result?.error || "Gagal menghapus");
		return result;
	}

	async function handleDeleteApplication(id: string) {
		setConfirmModal({
			isOpen: true,
			title: "Hapus Pendaftaran?",
			message: `Data akan terhapus permanen dari onboarding, kontrak, dan daftar karyawan (jika sudah di-approve).`,
			confirmText: "Ya, Hapus",
			variant: "danger",
			loading: false,
			onConfirm: async () => {
				try {
					await cascadeDelete([id]);
					setApplications((prev) => prev.filter((a: any) => a.id !== id));
					setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
					toast.success("Pendaftaran dihapus");
				} catch (e: any) { toast.error(e?.message || "Gagal menghapus"); }
				setConfirmModal((p) => ({ ...p, isOpen: false }));
			},
		});
	}

	async function handleBulkDelete() {
		if (selectedIds.size === 0) return;
		setConfirmModal({
			isOpen: true,
			title: `Hapus ${selectedIds.size} Pendaftaran?`,
			message: `${selectedIds.size} pendaftaran akan dihapus permanen dari onboarding, kontrak, dan daftar karyawan (jika sudah di-approve).`,
			confirmText: "Ya, Hapus Semua",
			variant: "danger",
			loading: false,
			onConfirm: async () => {
				setIsBulkDeleting(true);
				try {
					const ids = Array.from(selectedIds);
					await cascadeDelete(ids);
					setApplications((prev) => prev.filter((a: any) => !ids.includes(a.id)));
					setSelectedIds(new Set());
					toast.success(ids.length + " pendaftaran dihapus");
				} catch (e: any) { toast.error(e?.message || "Gagal menghapus"); }
				finally { setIsBulkDeleting(false); setConfirmModal((p) => ({ ...p, isOpen: false })); }
			},
		});
	}

	const toggleSelect = (id: string) => {
		setSelectedIds((prev) => {
			const n = new Set(prev);
			if (n.has(id)) n.delete(id); else n.add(id);
			return n;
		});
	};
	const toggleSelectAll = () => {
		if (selectedIds.size === applications.length) { setSelectedIds(new Set()); }
		else { setSelectedIds(new Set(applications.map((a: any) => a.id))); }
	};

	function goToDetail(app: any) {
		const registrationNumber = app.raw?.registrationNumber || app.id;
		window.location.href = "/admin/operational-team/register/application/" + registrationNumber;
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
				<CardHeader className="pb-2 sm:pb-3">
					<CardTitle className="text-base sm:text-lg">Daftar Pendaftaran</CardTitle>
				</CardHeader>
				<CardContent className="px-0 sm:px-6">
					{isLoading ? (
						<p className="px-4 py-10 text-center text-muted-foreground text-sm">Memuat data...</p>
					) : applications.length === 0 ? (
						<p className="px-4 py-10 text-center text-muted-foreground text-sm">Belum ada pendaftaran.</p>
					) : (
						<>
							{selectedIds.size > 0 && (
								<div className="flex items-center gap-2 mb-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
									<span className="text-xs font-medium text-muted-foreground">{selectedIds.size} dipilih</span>
									<Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isBulkDeleting} className="text-xs h-8 ml-auto">
										{isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
										Hapus {selectedIds.size}
									</Button>
								</div>
							)}
							{/* ---- desktop table ---- */}
							<div className="hidden overflow-x-auto rounded-xl border sm:block">
								<table className="w-full text-left text-sm">
									<thead className="bg-muted/50 text-muted-foreground">
										<tr><th className="p-3 w-10"><input type="checkbox" className="h-3.5 w-3.5 rounded" checked={applications.length > 0 && selectedIds.size === applications.length} onChange={toggleSelectAll} /></th><th className="p-3">Nama</th><th className="p-3">Role</th><th className="p-3 hidden md:table-cell">Kontak</th><th className="p-3 hidden md:table-cell">Tanggal</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr>
									</thead>
									<tbody className="divide-y">
										{applications.map((app: any) => (
											<tr key={app.id} className="hover:bg-muted/30">
												<td className="p-3 w-10"><input type="checkbox" className="h-3.5 w-3.5 rounded" checked={selectedIds.has(app.id)} onChange={() => toggleSelect(app.id)} /></td>
												<td className="p-3 font-medium">{app.full_name}</td>
												<td className="p-3">{app.employment?.roleName ?? "-"}</td>
												<td className="p-3 hidden md:table-cell">{app.phone}<br /><span className="text-muted-foreground">{app.email}</span></td>
												<td className="p-3 hidden md:table-cell text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</td>
												<td className="p-3"><Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-xs">{app.status}</Badge></td>
												<td className="p-3 text-right">
													<Button size="sm" variant="outline" onClick={() => goToDetail(app)} className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm">
														<Eye className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />Detail
													</Button>
													<Button size="sm" variant="ghost" onClick={() => handleDeleteApplication(app.id)} disabled={deletingIds.has(app.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 ml-1">
														<Trash2 className="h-3.5 w-3.5" />
													</Button>
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
											<div>
												<div className="font-medium text-sm">{app.full_name}</div>
												<div className="text-muted-foreground text-xs">{app.employment?.roleName ?? "-"}</div>
											</div>
											<Badge variant={STATUS_VARIANT[app.status] ?? "secondary"} className="text-xs flex-shrink-0">{app.status}</Badge>
										</div>
										<div className="text-muted-foreground text-xs">{app.phone} &middot; {app.email}</div>
										<div className="text-muted-foreground text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</div>
										<div className="flex gap-2">
											<Button size="sm" variant="outline" onClick={() => goToDetail(app)} className="h-8 flex-1 text-xs">
												<Eye className="mr-1.5 h-3.5 w-3.5" />Detail
											</Button>
											<Button size="sm" variant="ghost" onClick={() => handleDeleteApplication(app.id)} disabled={deletingIds.has(app.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0">
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

			<ConfirmationModal
				isOpen={confirmModal.isOpen}
				onClose={() => setConfirmModal((p) => ({ ...p, isOpen: false }))}
				onConfirm={confirmModal.onConfirm}
				title={confirmModal.title}
				subtitle={confirmModal.subtitle}
				message={confirmModal.message}
				confirmText={confirmModal.confirmText}
				variant={confirmModal.variant}
				loading={confirmModal.loading}
			/>
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

export const Route = createLazyFileRoute("/admin/onboarding" as any)({ component: AdminOnboardingPage });
