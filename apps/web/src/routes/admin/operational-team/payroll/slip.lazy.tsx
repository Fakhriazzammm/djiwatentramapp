import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
	Search,
	Filter,
	Download,
	Eye,
	Loader2,
	AlertCircle,
	FileText,
	Send,
	AlertTriangle,
	Plus,
	RotateCw,
} from "lucide-react";
import {
	useHybridPayslips,
	updatePayslipStatus,
	autoDetectPeriodAndRun,
	updatePayrollRunItem,
	syncPayslipFromRunItem,
} from "@/hooks/use-hybrid-payroll-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { generatePayslipPDF, type PayslipData, type PayslipBreakdown } from "@/lib/payslip-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Constants ──────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
	generated: { label: "Generated", color: "text-gray-700", bg: "bg-gray-100" },
	sent: { label: "Dikirim", color: "text-blue-700", bg: "bg-blue-100" },
	acknowledged: { label: "Diterima", color: "text-green-700", bg: "bg-green-100" },
	disputed: { label: "Dispute", color: "text-red-700", bg: "bg-red-100" },
};

function fmtCurrency(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(amount);
}

function fmtCurrencyShort(amount: number): string {
	const abs = Math.abs(amount);
	if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}jt`;
	if (abs >= 1_000) return `${(amount / 1_000).toFixed(0)}rb`;
	return amount.toString();
}

function translateStatus(status: string): string {
	return STATUS_MAP[status]?.label ?? status;
}

function getStatusBadgeClass(status: string): string {
	const s = STATUS_MAP[status];
	return s ? `${s.bg} ${s.color}` : "bg-gray-100 text-gray-700";
}

function getStatusActionLabel(status: string): string | null {
	if (status === "generated") return "Kirim";
	if (status === "sent") return "Tandai Diterima";
	return null;
}

function getNextStatus(status: string): string | null {
	if (status === "generated") return "sent";
	if (status === "sent") return "acknowledged";
	return null;
}

function getStatusTransitionLabel(status: string): string | null {
	if (status === "generated") return "send";
	if (status === "sent") return "acknowledge";
	return null;
}

// ─── Relative Path ──────────────────────────────────────────────────
const relativePath = "/admin/operational-team/payroll/slip" as any;

// ─── Main Component ─────────────────────────────────────────────────
function PayslipAdminPage() {
	// ── Data Hooks ──────────────────────────────────────────────────
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [periodFilter, setPeriodFilter] = useState<string>("");
	const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [confirmConfig, setConfirmConfig] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		variant: "danger" | "warning" | "info";
		onConfirm: () => void;
	}>({ isOpen: false, title: "", message: "", variant: "info" as const, onConfirm: () => {} });

	const allPayslips = useHybridPayslips({ status: statusFilter || undefined }) as any[] | null;
	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";
	const storeAddress = settings?.storeAddress || "";
	const [isAutoProcessing, setIsAutoProcessing] = useState(false);
	const [autoTrigger, setAutoTrigger] = useState(0);
	const [editingCell, setEditingCell] = useState<{
		payslipId: string;
		runItemId: string;
		field: string;
	} | null>(null);

	// ── Filtered Data ──────────────────────────────────────────────
	const filteredPayslips = useMemo(() => {
		if (!allPayslips) return null;
		let result = [...allPayslips];

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter((p: any) =>
				(p.user_name ?? "").toLowerCase().includes(q)
			);
		}

		if (periodFilter) {
			result = result.filter((p: any) =>
				(p.payroll_period_id ?? p.period_name) === periodFilter
			);
		}

		return result.sort((a: any, b: any) =>
			new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
		);
	}, [allPayslips, searchQuery, periodFilter]);

	const summary = useMemo(() => {
		if (!filteredPayslips) return null;
		return {
			count: filteredPayslips.length,
			totalGross: filteredPayslips.reduce((s: number, p: any) => s + (p.gross_pay ?? 0), 0),
			totalDeductions: filteredPayslips.reduce((s: number, p: any) => s + (p.deductions ?? 0), 0),
			totalNet: filteredPayslips.reduce((s: number, p: any) => s + (p.net_pay ?? 0), 0),
		};
	}, [filteredPayslips]);

	const periodOptions = useMemo(() => {
		if (!allPayslips || allPayslips.length === 0) return [];
		const unique = new Map<string, { value: string; label: string }>();
		allPayslips.forEach((p: any) => {
			const id = p.payroll_period_id ?? p.period_name;
			const label = p.period_name ?? `${p.period_start ?? ""} - ${p.period_end ?? ""}`;
			if (id && !unique.has(id)) {
				unique.set(id, { value: id, label });
			}
		});
		return Array.from(unique.values());
	}, [allPayslips]);

	// ── Handlers ────────────────────────────────────────────────────
	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleSelectAll = useCallback(() => {
		if (!filteredPayslips) return;
		if (selectedIds.size === filteredPayslips.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(filteredPayslips.map((p: any) => p.id)));
		}
	}, [filteredPayslips, selectedIds]);

	const handleDownloadPDF = useCallback(async (payslip: any) => {
		try {
			const breakdown: PayslipBreakdown = payslip.breakdown ?? {};
			const blob = generatePayslipPDF(
				{
					id: payslip.id,
					user_id: payslip.user_id,
					user_name: payslip.user_name,
					period_name: payslip.period_name,
					period_start: payslip.period_start,
					period_end: payslip.period_end,
					gross_pay: payslip.gross_pay ?? 0,
					deductions: payslip.deductions ?? 0,
					net_pay: payslip.net_pay ?? 0,
					status: payslip.status ?? "generated",
					sent_at: payslip.sent_at,
					acknowledged_at: payslip.acknowledged_at,
					breakdown,
				},
				breakdown,
				storeName,
				storeAddress
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `slip-gaji-${(payslip.user_name ?? "karyawan").toLowerCase().replace(/\s+/g, "-")}-${(payslip.period_name ?? "").toLowerCase().replace(/\s+/g, "-")}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("PDF berhasil diunduh");
		} catch (e: any) {
			toast.error(`Gagal mengunduh PDF: ${e.message}`);
		}
	}, [storeName, storeAddress]);

	const handleStatusUpdate = useCallback(async (payslipId: string, newStatus: string) => {
		try {
			await updatePayslipStatus({ payslipId, status: newStatus as any });
			toast.success("Status berhasil diperbarui!");
			setSelectedPayslip(null);
		} catch (e: any) {
			toast.error(`Gagal memperbarui status: ${e.message}`);
		}
	}, []);

	const handleSendStatus = useCallback((payslip: any) => {
		const nextStatus = getNextStatus(payslip.status);
		if (!nextStatus) return;
		const label = getStatusTransitionLabel(payslip.status);
		setConfirmConfig({
			isOpen: true,
			title: label === "send" ? "Kirim Slip Gaji?" : "Tandai Diterima?",
			message: label === "send"
				? `Slip gaji ${payslip.user_name} akan ditandai sebagai "Dikirim". Karyawan dapat melihatnya di profil.`
				: `Slip gaji ${payslip.user_name} akan ditandai sebagai "Diterima oleh Karyawan".`,
			variant: "warning" as const,
			onConfirm: async () => {
				await handleStatusUpdate(payslip.id, nextStatus);
				setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
			},
		});
	}, [handleStatusUpdate]);

	const handleBulkSend = useCallback(async () => {
		if (selectedIds.size === 0) { toast.error("Pilih slip gaji terlebih dahulu"); return; }
		const selected = filteredPayslips?.filter((p: any) => selectedIds.has(p.id) && p.status === "generated") ?? [];
		if (selected.length === 0) { toast.error("Tidak ada slip dengan status 'generated' yang dipilih"); return; }

		setConfirmConfig({
			isOpen: true,
			title: `Kirim ${selected.length} Slip Gaji?`,
			message: `${selected.length} slip gaji akan dikirim ke karyawan.`,
			variant: "warning" as const,
			onConfirm: async () => {
				let success = 0;
				for (const slip of selected) {
					try {
						await updatePayslipStatus({ payslipId: slip.id, status: "sent" as any });
						success++;
					} catch { /* continue */ }
				}
				toast.success(`${success} slip berhasil dikirim`);
				setSelectedIds(new Set());
				setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
			},
		});
	}, [selectedIds, filteredPayslips]);

	const handleExportCSV = useCallback(() => {
		if (!filteredPayslips || filteredPayslips.length === 0) {
			toast.error("Tidak ada data untuk diexport");
			return;
		}

		const headers = [
			"Periode", "Nama Karyawan",
			"Gaji Tetap", "Gaji Shift", "Tunjangan",
			"Bonus Lembur", "Bonus Target",
			"Denda", "Total Gross", "Potongan",
			"Net Diterima", "Status"
		];

		const rows = filteredPayslips.map((p: any) => {
			const b = p.breakdown ?? {};
			return [
				p.period_name ?? "",
				p.user_name ?? "",
				b.monthly_fixed_salary ?? 0,
				b.total_shift_pay ?? 0,
				b.total_allowance ?? 0,
				b.total_overtime_bonus ?? 0,
				b.bonus_target?.total_bonus ?? 0,
				b.total_penalty ?? 0,
				p.gross_pay ?? 0,
				p.deductions ?? 0,
				p.net_pay ?? 0,
				translateStatus(p.status),
			].join(",");
		});

		const csv = [headers.join(","), ...rows].join("\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `payslip-export-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success(`${rows.length} payslip diexport sebagai CSV`);
	}, [filteredPayslips]);

	// ── Auto-Run on Mount ───────────────────────────────────────────
	useEffect(() => {
		if (allPayslips === undefined) return;
		if (allPayslips === null) return;

		if (allPayslips.length === 0) {
			setIsAutoProcessing(true);
			autoDetectPeriodAndRun().then((result) => {
				setIsAutoProcessing(false);
				if (result.action !== "skipped" && result.action !== "error") {
					setAutoTrigger((n) => n + 1);
					toast.success(result.message);
				}
			}).catch(() => setIsAutoProcessing(false));
		}
	}, [allPayslips, autoTrigger]);

	// ── Inline Edit ─────────────────────────────────────────────────
	const handleInlineSave = useCallback(async (payslipId: string, runItemId: string, field: string, value: number) => {
		try {
			await updatePayrollRunItem({ runItemId, field, value });
			await syncPayslipFromRunItem({ runItemId, payslipId });
			toast.success(`${field} berhasil diperbarui`);
		} catch (e: any) {
			toast.error(`Gagal menyimpan: ${e.message}`);
		}
		setEditingCell(null);
	}, []);

	// ── Render ─────────────────────────────────────────────────────
	const isLoading = allPayslips === undefined;
	const isError = allPayslips === null;

	if (isLoading) {
		return (
			<div className="space-y-4 p-6">
				<div className="flex items-center justify-between">
					<div>
						<Skeleton className="h-7 w-40" />
						<Skeleton className="mt-1 h-4 w-60" />
					</div>
					<Skeleton className="h-9 w-32" />
				</div>
				<div className="flex gap-3">
					<Skeleton className="h-10 flex-1" />
					<Skeleton className="h-10 w-40" />
					<Skeleton className="h-10 w-32" />
				</div>
				{[1, 2, 3, 4, 5].map((i) => (
					<Skeleton key={i} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<AlertCircle className="h-12 w-12 text-destructive" />
				<p className="mt-4 text-sm font-medium text-destructive">Gagal memuat data slip gaji</p>
				<p className="text-xs text-muted-foreground">Terjadi kesalahan saat mengambil data dari server</p>
				<Button className="mt-6" onClick={() => window.location.reload()} variant="default">
					<RotateCw className="mr-2 h-4 w-4" /> Coba Lagi
				</Button>
			</div>
		);
	}

	const isEmpty = !allPayslips || allPayslips.length === 0;
	const isFilteredEmpty = !isEmpty && filteredPayslips && filteredPayslips.length === 0;

	return (
		<div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
			{/* HEADER */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
						Slip Gaji
					</h2>
					<p className="mt-0.5 text-muted-foreground text-xs md:text-sm">
						Kelola, kontrol, dan distribusi slip gaji seluruh karyawan
					</p>
				</div>
			</div>

			{/* ACTION BAR */}
			<div className="flex flex-wrap items-center gap-2">
				{!isEmpty && (
							<>
						{selectedIds.size > 0 && (
							<Button
								variant="default"
								size="sm"
								className="text-xs h-9"
								onClick={handleBulkSend}
							>
								<Send className="mr-1.5 h-3.5 w-3.5" />
								Kirim {selectedIds.size} Slip
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							className="text-xs h-9"
							onClick={handleExportCSV}
						>
							<Download className="mr-1.5 h-3.5 w-3.5" />
							Export CSV
						</Button>
					</>
				)}
			</div>

			{/* AUTO-REFRESH INDICATOR */}
			{isAutoProcessing && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
					<Loader2 className="h-3 w-3 animate-spin" />
					<span>Menghitung slip gaji dari data absensi...</span>
				</div>
			)}
			{!isAutoProcessing && allPayslips && allPayslips.length > 0 && (
				<div className="flex items-center gap-1 text-[10px] text-emerald-600/70 px-1">
					<div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
					<span>Real-time dari absensi</span>
				</div>
			)}

			{/* FILTER BAR */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="relative flex-1 min-w-[200px]">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Cari karyawan..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10 h-10 text-sm"
					/>
				</div>
				<Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
					<SelectTrigger className="w-[140px] h-10 text-sm">
						<SelectValue placeholder="Semua Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Semua Status</SelectItem>
						<SelectItem value="generated">Generated</SelectItem>
						<SelectItem value="sent">Dikirim</SelectItem>
						<SelectItem value="acknowledged">Diterima</SelectItem>
						<SelectItem value="disputed">Dispute</SelectItem>
					</SelectContent>
				</Select>
				<Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v ?? "")}>
					<SelectTrigger className="w-[180px] h-10 text-sm">
						<SelectValue placeholder="Semua Periode" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Semua Periode</SelectItem>
						{periodOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* EMPTY STATE */}
			{isEmpty && (
				<div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
					<FileText className="h-16 w-16 text-muted-foreground/30" />
					<p className="mt-4 text-sm font-medium text-muted-foreground">Belum ada data slip gaji</p>
					<p className="text-xs text-muted-foreground/70 mt-1">
						Belum ada data absensi untuk periode ini. Slip gaji akan muncul otomatis setelah ada data kehadiran.
					</p>
					{allPayslips && allPayslips.length === 0 && (
						<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
							<div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
							<span>Auto-generate aktif — slip akan muncul otomatis</span>
						</div>
					)}
				</div>
			)}

			{/* FILTERED EMPTY STATE */}
			{isFilteredEmpty && (
				<div className="flex flex-col items-center justify-center py-12">
					<Filter className="h-10 w-10 text-muted-foreground/40" />
					<p className="mt-3 text-sm font-medium text-muted-foreground">Tidak ada slip yang cocok dengan filter</p>
					<Button
						variant="link"
						size="sm"
						className="mt-2 text-xs"
						onClick={() => { setSearchQuery(""); setStatusFilter(""); setPeriodFilter(""); }}
					>
						Hapus filter
					</Button>
				</div>
			)}

			{/* MASTER TABLE */}
			{!isEmpty && !isFilteredEmpty && filteredPayslips && (
				<>
					<div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-widest">
									<tr className="border-b border-border/50">
										<th className="px-3 py-3 w-10">
											<input
												type="checkbox"
												className="h-3.5 w-3.5 rounded"
												checked={filteredPayslips.length > 0 && selectedIds.size === filteredPayslips.length}
												onChange={toggleSelectAll}
											/>
										</th>
										<th className="px-3 py-3">Karyawan</th>
										<th className="px-3 py-3">Role</th>
										<th className="px-3 py-3">Periode</th>
										<th className="px-3 py-3 text-right">Gaji Bruto</th>
										<th className="px-3 py-3 text-right">Gaji Bersih</th>
										<th className="px-3 py-3 text-center">Status</th>
										<th className="px-3 py-3 text-right">Aksi</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/50">
									{filteredPayslips.map((payslip: any) => {
										const breakdown = payslip.breakdown ?? {};
										return (
											<tr
												key={payslip.id}
												className="group transition-colors hover:bg-muted/30 cursor-pointer"
												onClick={() => setSelectedPayslip(payslip)}
											>
												<td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
													<input
														type="checkbox"
														className="h-3.5 w-3.5 rounded"
														checked={selectedIds.has(payslip.id)}
														onChange={() => toggleSelect(payslip.id)}
													/>
												</td>
												<td className="px-3 py-2.5">
													<p className="font-semibold text-foreground text-xs">{payslip.user_name ?? "-"}</p>
												</td>
												<td className="px-3 py-2.5">
													<span className="text-[10px] text-muted-foreground">{breakdown.role_name ?? "-"}</span>
												</td>
												<td className="px-3 py-2.5 text-xs">{payslip.period_name ?? "-"}</td>
								<td className="px-3 py-2.5 text-right tabular-nums text-xs">
									{editingCell?.payslipId === payslip.id && editingCell.field === "gross_pay" ? (
										<input
											type="number"
											className="w-20 h-7 px-1 text-right text-xs border rounded"
											defaultValue={payslip.gross_pay ?? 0}
											autoFocus
											onBlur={(e) => {
												e.stopPropagation();
												const val = Number(e.target.value);
												if (isFinite(val) && val !== (payslip.gross_pay ?? 0)) {
													handleInlineSave(payslip.id, payslip.payroll_run_item_id, "gross_pay", val);
												} else {
													setEditingCell(null);
												}
											}}
											onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingCell(null); }}
										/>
									) : (
										<span
											className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
											onClick={(e) => { e.stopPropagation(); setEditingCell({ payslipId: payslip.id, runItemId: payslip.payroll_run_item_id, field: "gross_pay" }); }}
										>
											{fmtCurrencyShort(payslip.gross_pay ?? 0)}
										</span>
									)}
								</td>
								<td className="px-3 py-2.5 text-right tabular-nums font-semibold text-xs">
									{editingCell?.payslipId === payslip.id && editingCell.field === "net_pay" ? (
										<input
											type="number"
											className="w-20 h-7 px-1 text-right text-xs border rounded"
											defaultValue={payslip.net_pay ?? 0}
											autoFocus
											onBlur={(e) => {
												e.stopPropagation();
												const val = Number(e.target.value);
												if (isFinite(val) && val !== (payslip.net_pay ?? 0)) {
													handleInlineSave(payslip.id, payslip.payroll_run_item_id, "net_pay", val);
												} else {
													setEditingCell(null);
												}
											}}
											onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingCell(null); }}
										/>
									) : (
										<span
											className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
											onClick={(e) => { e.stopPropagation(); setEditingCell({ payslipId: payslip.id, runItemId: payslip.payroll_run_item_id, field: "net_pay" }); }}
										>
											{fmtCurrencyShort(payslip.net_pay ?? 0)}
										</span>
									)}
								</td>
												<td className="px-3 py-2.5 text-center">
													<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(payslip.status)}`}>
														{translateStatus(payslip.status)}
													</span>
												</td>
												<td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
													<div className="flex items-center justify-end gap-1">
														<button
															type="button"
															className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
															title="Lihat Detail"
															onClick={() => setSelectedPayslip(payslip)}
														>
															<Eye className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
															title="Download PDF"
															onClick={() => handleDownloadPDF(payslip)}
														>
															<Download className="h-3.5 w-3.5" />
														</button>
														{getNextStatus(payslip.status) && (
															<button
																type="button"
																className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
																title={getStatusActionLabel(payslip.status) ?? ""}
																onClick={() => handleSendStatus(payslip)}
															>
																<Send className="h-3.5 w-3.5" />
															</button>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>

					{/* SUMMARY */}
					{summary && (
						<div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card/50 px-4 py-3 text-xs">
							<span className="font-medium text-muted-foreground">
								{summary.count} karyawan
							</span>
							<span className="text-muted-foreground/30">|</span>
							<span className="text-muted-foreground">
								Total Gross: <span className="font-semibold text-foreground">{fmtCurrency(summary.totalGross)}</span>
							</span>
							<span className="text-muted-foreground/30">|</span>
							<span className="text-muted-foreground">
								Total Net: <span className="font-semibold text-emerald-600">{fmtCurrency(summary.totalNet)}</span>
							</span>
							{summary.totalDeductions > 0 && (
								<>
									<span className="text-muted-foreground/30">|</span>
									<span className="text-muted-foreground">
										Potongan: <span className="font-semibold text-red-600">{fmtCurrency(summary.totalDeductions)}</span>
									</span>
								</>
							)}
						</div>
					)}
				</>
			)}

			{/* DETAIL DIALOG */}
			<Dialog open={!!selectedPayslip} onOpenChange={(open) => { if (!open) setSelectedPayslip(null); }}>
				<DialogContent className="max-w-lg w-full max-h-[85vh] overflow-y-auto">
					<DialogTitle className="sr-only">Detail Slip Gaji</DialogTitle>
					<DialogDescription className="sr-only">Informasi lengkap slip gaji karyawan</DialogDescription>
					{selectedPayslip && (() => {
						const p = selectedPayslip;
						const b = p.breakdown ?? {};
						const monthName = p.period_name ?? new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date());
						return (
							<div className="space-y-4 text-sm">
								{/* Header */}
								<div className="text-center border-b pb-3">
									<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slip Gaji</p>
									<h2 className="text-lg font-black text-foreground mt-0.5">{p.user_name ?? "-"}</h2>
									<p className="text-xs text-muted-foreground">{b.role_name ?? "-"}</p>
									<p className="text-xs font-semibold text-primary mt-1">{monthName}</p>
								</div>

								{/* Attendance Summary */}
								<div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Hari Kerja</span>
										<span className="font-semibold">{b.days_worked ?? 0} hari</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Jumlah Shift</span>
										<span className="font-semibold">{b.shifts ?? 0} shift</span>
									</div>
									{(b.total_penalty ?? 0) > 0 && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Denda Keterlambatan</span>
											<span className="font-semibold text-red-600">{fmtCurrency(b.total_penalty)}</span>
										</div>
									)}
								</div>

								{/* Earnings */}
								<div className="space-y-1">
									<p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Komponen Gaji</p>
									<div className="rounded-lg border bg-card divide-y text-xs">
										{(b.monthly_fixed_salary ?? 0) > 0 && (
											<div className="flex justify-between px-3 py-2">
												<span className="text-muted-foreground">Gaji Tetap</span>
												<span className="font-semibold">{fmtCurrency(b.monthly_fixed_salary)}</span>
											</div>
										)}
										{(b.total_shift_pay ?? 0) > 0 && (
											<div className="flex justify-between px-3 py-2">
												<span className="text-muted-foreground">Gaji Shift ({b.shifts ?? 0}x)</span>
												<span className="font-semibold">{fmtCurrency(b.total_shift_pay)}</span>
											</div>
										)}
										{(b.total_allowance ?? 0) > 0 && (
											<div className="flex justify-between px-3 py-2">
												<span className="text-muted-foreground">Tunjangan Transportasi</span>
												<span className="font-semibold">{fmtCurrency(b.total_allowance)}</span>
											</div>
										)}
										{(b.total_overtime_bonus ?? 0) > 0 && (
											<div className="flex justify-between px-3 py-2">
												<span className="text-muted-foreground">Bonus Lembur</span>
												<span className="font-semibold text-emerald-600">+{fmtCurrency(b.total_overtime_bonus)}</span>
											</div>
										)}
										{(b.bonus_target?.total_bonus ?? 0) > 0 && (
											<div className="flex justify-between px-3 py-2">
												<span className="text-muted-foreground">Bonus Target</span>
												<span className="font-semibold text-emerald-600">+{fmtCurrency(b.bonus_target.total_bonus)}</span>
											</div>
										)}
									</div>
								</div>

								{/* Deductions */}
								{(p.deductions ?? 0) > 0 && (
									<div className="flex justify-between items-center px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs">
										<span className="font-semibold text-red-700">Total Potongan</span>
										<span className="font-semibold text-red-700">-{fmtCurrency(p.deductions)}</span>
									</div>
								)}

								{/* Total */}
								<div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3 flex justify-between items-center">
									<span className="text-sm font-black text-foreground uppercase tracking-wide">Total Gaji Bersih</span>
									<span className="text-lg font-black text-primary">{fmtCurrency(p.net_pay ?? 0)}</span>
								</div>

								{/* Status */}
								<div className={`rounded-lg p-3 text-center text-xs font-semibold ${getStatusBadgeClass(p.status)}`}>
									{translateStatus(p.status)}
									{p.sent_at && <span className="ml-1 font-normal opacity-75">— {new Date(p.sent_at).toLocaleDateString("id-ID")}</span>}
									{p.acknowledged_at && <span className="ml-1 font-normal opacity-75">— Diterima {new Date(p.acknowledged_at).toLocaleDateString("id-ID")}</span>}
								</div>

								{/* Actions */}
								<div className="flex gap-2 pt-2">
									<Button
										variant="default"
										size="sm"
										className="flex-1 text-xs"
										onClick={() => handleDownloadPDF(p)}
									>
										<Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
									</Button>
									{getNextStatus(p.status) && (
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-xs"
											onClick={() => {
												handleSendStatus(p);
											}}
										>
											<Send className="mr-1.5 h-3.5 w-3.5" />
											{getStatusActionLabel(p.status)}
										</Button>
									)}
									{p.status === "acknowledged" && (
										<Button
											variant="outline"
											size="sm"
											className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50"
											onClick={() => {
												setConfirmConfig({
													isOpen: true,
													title: "Tandai Dispute?",
													message: `Slip gaji ${p.user_name} akan ditandai sebagai "Dispute".`,
													variant: "danger",
													onConfirm: async () => {
														try {
															await updatePayslipStatus({ payslipId: p.id, status: "disputed" as any });
															toast.success("Status diubah ke Dispute");
															setSelectedPayslip(null);
															setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
														} catch (e: any) {
															toast.error(e.message);
														}
													},
												});
											}}
										>
											<AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
											Dispute
										</Button>
									)}
								</div>
							</div>
						);
					})()}
				</DialogContent>
			</Dialog>

			{/* CONFIRMATION MODAL */}
			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
				title={confirmConfig.title}
				message={confirmConfig.message}
				variant={confirmConfig.variant}
				onConfirm={confirmConfig.onConfirm}
			/>
		</div>
	);
}

export const Route = createLazyFileRoute(relativePath)({
	component: PayslipAdminPage,
});
