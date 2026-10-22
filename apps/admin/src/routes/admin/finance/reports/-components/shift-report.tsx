import { useEffect, useMemo, useState } from "react";
import {
	BadgeDollarSign,
	ChevronRight,
	CalendarDays,
	CheckCircle2,
	Search,
	Activity,
	Clock3,
	Copy,
	Download,
	FileText,
	Image as ImageIcon,
	Loader2,
	Mail,
	MoreHorizontal,
	Pencil,
	Plus,
	ReceiptText,
	Trash2,
	TrendingUp,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { toast } from "sonner";
import {
	useHybridShiftReportRows,
	useHybridShiftDetails,
	useHybridSiteSettings,
	useHybridStaffUsers,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridAdminBulkDeleteShifts,
	useHybridAdminDeleteShift,
	useHybridAdminUpdateShift,
	useHybridSendShiftTableReportEmail,
	useHybridStartShift,
} from "@/hooks/use-hybrid-write-actions";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRange } from "./period-selector";
import {
	exportShiftReportsCSV,
	exportShiftReportsJPG,
	exportShiftReportsPDF,
	formatCurrencyIDR,
	type ShiftReportDetails,
	type ShiftReportRow,
	type ShiftReportTotals,
} from "@/lib/export-utils";

interface Props {
	range: DateRange;
	preferredSelectedStartTime?: number;
}

type BonusTier = { thresholdPct: number; bonusAmount: number };
type MemberBonusInfo = {
	name: string;
	roleName: string;
	bonus: number;
	basis: "shift" | "daily" | "monthly";
	achievedTiers: number[];
	allTiers: BonusTier[];
};

type ShiftRow = {
	shiftId: string;
	shiftName: string;
	notes: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	endingCashExpected: number;
	endingCashPhysical?: number;
	nonCashExpected: number;
	nonCashConfirmed?: number;
	hasTarget?: boolean;
	targetMonth?: string;
	dailyTarget?: number;
	shiftTarget?: number;
	dailyCollected?: number;
	shiftCollected?: number;
	dailyTargetProgress?: number;
	shiftTargetProgress?: number;
	isDailyTargetMet?: boolean;
	isShiftTargetMet?: boolean;
	memberBonuses?: MemberBonusInfo[];
};

function formatDateTime(timestamp: number, withTime = false) {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		...(withTime
			? {
					hour: "2-digit",
					minute: "2-digit",
			  }
			: {}),
	});
}

function formatTime(timestamp?: number) {
	if (!timestamp) return "Aktif";
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatCompactRange(startTime: number, endTime?: number) {
	return `${formatDateTime(startTime)} • ${formatTime(startTime)}-${formatTime(endTime)}`;
}

function formatTeamMembersByRole(teamMembers: string, allStaffUsers: any[] | undefined): string {
	if (!teamMembers?.trim()) return "-";
	const names = teamMembers.split(",").map((n: string) => n.trim()).filter(Boolean);
	if (!names.length) return "-";
	if (!allStaffUsers?.length) return teamMembers;
	const grouped = new Map<string, string[]>();
	const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Manajer"];
	names.forEach((name: string) => {
		const user = allStaffUsers.find((u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase());
		const role = user?.roleName?.trim() || "Lainnya";
		if (!grouped.has(role)) grouped.set(role, []);
		grouped.get(role)!.push(name);
	});
	const sortedRoles = [...grouped.keys()].sort((a, b) => {
		const ai = roleOrder.findIndex(r => r.toLowerCase() === a.toLowerCase());
		const bi = roleOrder.findIndex(r => r.toLowerCase() === b.toLowerCase());
		return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
	});
	return sortedRoles.map(role => {
		const formattedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
		return `${formattedRole}: ${grouped.get(role)!.join(", ")}`;
	}).join("\n");
}

function buildShiftSummaryText(shift: ShiftRow, details: any, allStaffUsers?: any[]) {
	const productBreakdown = details?.productBreakdown ?? [];
	const topProducts = details?.topProducts ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = formatTeamMembersByRole(shift.teamMembers ?? "", allStaffUsers);
	const derivedTotalItems = productBreakdown.reduce(
		(acc: number, category: any) => acc + Number(category?.totalQuantity ?? 0),
		0,
	);
	const totalItems = shift.totalItemsSold > 0 ? shift.totalItemsSold : derivedTotalItems;
	const lines: string[] = [
		"Daily Revenue Report",
		"Djiwa Tentram",
		`Tanggal: ${formatDateTime(shift.startTime)}`,
		"",
		`${shift.shiftName} (${shift.status})`,
		`Modal Kasir: ${formatCurrencyIDR(shift.startingCash)}`,
		`Tunai: ${formatCurrencyIDR(shift.cashRevenue)}`,
		`Debit/QRIS: ${formatCurrencyIDR(shift.qrisRevenue)}`,
		`Lainnya: ${formatCurrencyIDR(shift.otherRevenue)}`,
		"",
		`Total Penjualan Bruto: ${formatCurrencyIDR(shift.totalGrossSales)}`,
		`Total Potongan (Diskon): ${formatCurrencyIDR(shift.totalDiscount)}`,
		`Total Revenue Bersih: ${formatCurrencyIDR(shift.totalRevenue)}`,
		"",
		`Produk Terjual: ${totalItems}`,
		"Rincian Produk:",
	];

	if (productBreakdown.length > 0) {
		for (const category of productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  • ${item.productName}: ${item.quantity}`);
			}
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push("TOP 3 PRODUK TERLARIS:");
	if (topProducts.length > 0) {
		for (const item of topProducts) {
			lines.push(`- ${item.productName}: ${item.quantity}`);
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	if (shift.hasTarget) {
		lines.push("STATUS TARGET:");
		lines.push(
			`- Target Shift: ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Target Harian: ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Revenue Harian: ${formatCurrencyIDR(shift.dailyCollected ?? 0)}`,
		);
		if (shift.memberBonuses?.length) {
			lines.push("BONUS BERTINGKAT:");
			for (const member of shift.memberBonuses) {
				const tierText = member.allTiers.map((tier) => `${tier.thresholdPct}%: ${formatCurrencyIDR(tier.bonusAmount)}`).join(" | ");
				const achieved = member.achievedTiers.length ? `${member.achievedTiers.join("%, ")}%` : "Belum mencapai tier";
				lines.push(`- ${member.name} (${member.roleName}) · Basis ${member.basis}: ${achieved} · Bonus ${formatCurrencyIDR(member.bonus)}`);
				if (tierText) lines.push(`  Tier: ${tierText}`);
			}
		}
		lines.push("");
	}

	lines.push(`Pengeluaran Shift: ${formatCurrencyIDR(shift.totalExpenses)}`);
	if (expenseBreakdown.length > 0) {
		for (const expense of expenseBreakdown) {
			lines.push(`- ${expense.category}: ${formatCurrencyIDR(expense.amount)}`);
		}
	}

	lines.push("");
	lines.push(`Kasir: ${shift.cashierName || "-"}`);
	lines.push(`Tim: ${teamLabel}`);

	return lines.join("\n");
}

export function ShiftReport({ range, preferredSelectedStartTime }: Props) {
	const sendShiftTableReportEmail = useHybridSendShiftTableReportEmail();
	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Toko";
	const allRows = useHybridShiftReportRows() as ShiftRow[] | undefined;
	const allStaffUsers = useHybridStaffUsers();
	const rows = useMemo(() => {
		if (!allRows) {
			return undefined;
		}
		// range.startDate/endDate sudah dalam bentuk timestamp (ms) dari date-fns
		// (startOfDay/endOfDay). Gunakan langsung, bukan dibungkus new Date() lagi.
		const startTime = range.startDate;
		const endTime = range.endDate;
		return allRows.filter(
			(row) => row.startTime >= startTime && row.startTime <= endTime
		);
	}, [allRows, range.endDate, range.startDate]);

	const adminUpdateShift = useHybridAdminUpdateShift();
	const adminDeleteShift = useHybridAdminDeleteShift();
	const adminBulkDeleteShifts = useHybridAdminBulkDeleteShifts();

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(preferredSelectedStartTime ?? null);
	const [isExporting, setIsExporting] = useState(false);
	const [isSendingFullEmail, setIsSendingFullEmail] = useState(false);

	// Checkbox selection state
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isDeleting, setIsDeleting] = useState(false);
	const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

	const startShift = useHybridStartShift();

	// Edit state
	const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
	const [editForm, setEditForm] = useState({ cashierName: "", teamMembers: "", shiftName: "", notes: "", startingCash: 0 });
	const [isSavingEdit, setIsSavingEdit] = useState(false);

	// Create shift state
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<"SEMUA" | "AKTIF" | "SELESAI">("SEMUA");
	const [isCreatingShift, setIsCreatingShift] = useState(false);
	const [createForm, setCreateForm] = useState({ shiftName: "", cashierName: "", teamMembers: "", startingCash: 0, notes: "" });

	const allIds = useMemo(() => (rows ?? []).map((r) => r.shiftId), [rows]);
	const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
	const someSelected = selectedIds.size > 0;

	function toggleRow(id: string, e: React.MouseEvent) {
		e.stopPropagation();
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}

	function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
		setSelectedIds(e.target.checked ? new Set(allIds) : new Set());
	}

	function openEdit(shift: ShiftRow, e: React.MouseEvent) {
		e.stopPropagation();
		setEditingShift(shift);
		setEditForm({
			cashierName: shift.cashierName ?? "",
			teamMembers: shift.teamMembers ?? "",
			shiftName: shift.shiftName ?? "",
			notes: "",
			startingCash: shift.startingCash ?? 0,
		});
	}

	async function handleSaveEdit() {
		if (!editingShift) return;
		setIsSavingEdit(true);
		try {
			await adminUpdateShift({ shiftId: editingShift.shiftId as any, ...editForm });
			toast.success("Shift berhasil diperbarui");
			setEditingShift(null);
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal memperbarui shift");
		} finally {
			setIsSavingEdit(false);
		}
	}

	async function handleDeleteConfirmed() {
		if (!confirmDeleteIds?.length) return;
		setIsDeleting(true);
		try {
			if (confirmDeleteIds.length === 1) {
				await adminDeleteShift({ shiftId: confirmDeleteIds[0] as any });
				toast.success("Shift berhasil dihapus");
			} else {
				const count = await adminBulkDeleteShifts({ shiftIds: confirmDeleteIds as any[] });
				toast.success(`${count} shift berhasil dihapus`);
			}
			setSelectedIds(new Set());
			setConfirmDeleteIds(null);
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal menghapus shift");
		} finally {
			setIsDeleting(false);
		}
	}

	async function handleCreateShift() {
		if (!createForm.shiftName.trim()) {
			toast.error("Nama shift wajib diisi");
			return;
		}
		setIsCreatingShift(true);
		try {
			await startShift({
				shiftName: createForm.shiftName.trim(),
				cashierName: createForm.cashierName.trim() || null,
				teamMembers: createForm.teamMembers.trim() || null,
				startingCash: Number(createForm.startingCash ?? 0),
				notes: createForm.notes.trim() || null,
			});
			toast.success("Shift baru berhasil dibuka");
			setShowCreateDialog(false);
			setCreateForm({ shiftName: "", cashierName: "", teamMembers: "", startingCash: 0, notes: "" });
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal membuka shift baru");
		} finally {
			setIsCreatingShift(false);
		}
	}

	useEffect(() => {
		if (!rows?.length) {
			setSelectedShiftStart(null);
			return;
		}

		if (preferredSelectedStartTime && rows.some((shift) => shift.startTime === preferredSelectedStartTime)) {
			setSelectedShiftStart(preferredSelectedStartTime);
			return;
		}

		if (
			selectedShiftStart === null ||
			!rows.some((shift) => shift.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(rows[0].startTime);
		}
	}, [preferredSelectedStartTime, rows, selectedShiftStart]);

	const selectedShift =
		rows?.find((shift) => shift.startTime === selectedShiftStart) ?? rows?.[0];

	const visibleRows = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return (rows ?? []).filter((shift) => {
			const matchesStatus = statusFilter === "SEMUA" || shift.status === statusFilter;
			const matchesQuery = !query || [shift.shiftName, shift.cashierName, shift.teamMembers]
				.some((value) => value?.toLowerCase().includes(query));
			return matchesStatus && matchesQuery;
		});
	}, [rows, searchTerm, statusFilter]);

	const details = useHybridShiftDetails(
		selectedShift
			? {
					startTime: selectedShift.startTime,
					endTime: selectedShift.endTime,
			  }
			: "skip",
	);

	const totals = useMemo(() => {
		const safeRows = rows ?? [];
		return safeRows.reduce(
			(acc, shift) => {
				acc.totalRevenue += shift.totalRevenue;
				acc.totalGross += shift.totalGrossSales;
				acc.totalDiscount += shift.totalDiscount;
				acc.totalExpenses += shift.totalExpenses;
				acc.totalItems += shift.totalItemsSold;
				acc.activeCount += shift.status === "AKTIF" ? 1 : 0;
				return acc;
			},
			{
				totalRevenue: 0,
				totalGross: 0,
				totalDiscount: 0,
				totalExpenses: 0,
				totalItems: 0,
				activeCount: 0,
			},
		);
	}, [rows]);

	if (!rows) {
		return (
			<div className="space-y-4">
				<div className="grid gap-3 md:grid-cols-4">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-24 rounded-[20px]" />
					))}
				</div>
				<Skeleton className="h-[420px] rounded-[20px]" />
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground">
				<Users className="mb-3 h-10 w-10 opacity-30" />
				<p className="font-semibold text-foreground">Belum ada data shift</p>
				<p className="mt-1 text-sm">
					Coba ubah periode atau mulai shift baru agar laporan tampil di sini.
				</p>
			</div>
		);
	}

	const summaryText =
		selectedShift && details
			? buildShiftSummaryText(selectedShift, details, allStaffUsers)
			: "";

	const handleExport = async (format: "pdf" | "csv" | "jpg") => {
		if (!rows?.length) return;
		setIsExporting(true);
		try {
			const shiftRows = rows as ShiftReportRow[];
			const shiftTotals = totals as ShiftReportTotals;
			const shiftDetails = details as ShiftReportDetails | undefined;
			const selected = selectedShift as ShiftReportRow | undefined;

			if (format === "pdf") {
				exportShiftReportsPDF(
					shiftRows,
					storeName,
					range.label,
					shiftTotals,
					selected,
					shiftDetails,
				);
			} else if (format === "csv") {
				exportShiftReportsCSV(shiftRows, range.label);
			} else {
				exportShiftReportsJPG(
					shiftRows,
					storeName,
					range.label,
					shiftTotals,
					selected,
					shiftDetails,
				);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const handleSendFullReportEmail = async () => {
		if (!rows?.length) return;
		try {
			setIsSendingFullEmail(true);
			await sendShiftTableReportEmail({
				startDate: range.startDate,
				endDate: range.endDate,
				periodLabel: range.label,
				selectedStartTime: selectedShift?.startTime,
				selectedEndTime: selectedShift?.endTime,
			});
			toast.success("Laporan shift lengkap berhasil dikirim ke email");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Gagal mengirim email laporan shift lengkap.";
			toast.error(message);
		} finally {
			setIsSendingFullEmail(false);
		}
	};

	return (
		<>
			<div className="space-y-3">
				{/* Command header: one clear monitoring decision */}
				<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Activity className="h-5 w-5" />
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-base font-bold tracking-tight text-foreground">Pusat Kendali Shift</h2>
								<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
									<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
									{totals.activeCount > 0 ? `${totals.activeCount} aktif` : "Tidak ada shift aktif"}
								</span>
							</div>
							<p className="mt-0.5 truncate text-xs text-muted-foreground">Pantau shift berjalan dan pencapaian target</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button type="button" onClick={() => { setCreateForm({ shiftName: "", cashierName: "", teamMembers: "", startingCash: 0, notes: "" }); setShowCreateDialog(true); }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-[.97] hover:bg-primary/90">
							<Plus className="h-3.5 w-3.5" /> Buka Shift
						</button>
						<div className="relative">
							<button type="button" onClick={() => setShowActionsMenu((open) => !open)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Aksi laporan shift" aria-expanded={showActionsMenu}>
								<MoreHorizontal className="h-4 w-4" />
							</button>
							{showActionsMenu && <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
								{([["pdf", "Export PDF", FileText], ["csv", "Export CSV", Download], ["jpg", "Export JPG", ImageIcon]] as const).map(([format, label, Icon]) => (
									<button key={format} type="button" onClick={() => { setShowActionsMenu(false); void handleExport(format); }} disabled={isExporting} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-muted disabled:opacity-40"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}</button>
								))}
								<div className="my-1 border-t border-border" />
								<button type="button" onClick={() => { setShowActionsMenu(false); void handleSendFullReportEmail(); }} disabled={isSendingFullEmail} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-muted disabled:opacity-40">{isSendingFullEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 text-muted-foreground" />}Kirim laporan lengkap</button>
							</div>}
						</div>
					</div>
				</section>

			{/* KPI strip: one row, no decorative card maze */}
				<section className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
					<CommandMetric label="Revenue bersih" value={formatCurrencyIDR(totals.totalRevenue, true)} helper={`Bruto ${formatCurrencyIDR(totals.totalGross, true)}`} />
					<CommandMetric label="Shift" value={`${totals.activeCount} aktif`} helper={`${rows.length} shift`} />
					<CommandMetric label="Produk terjual" value={`${totals.totalItems}`} helper={`Diskon ${formatCurrencyIDR(totals.totalDiscount, true)}`} />
					<CommandMetric label="Pengeluaran" value={formatCurrencyIDR(totals.totalExpenses, true)} helper="Periode terpilih" />
				</section>

			{/* Operational toolbar */}
				<section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2.5 sm:flex-row sm:items-center">
					<div className="relative min-w-0 flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari shift, kasir, atau anggota tim..." className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Cari shift" />
					</div>
					<div className="flex items-center gap-1.5 overflow-x-auto">
						{(["SEMUA", "AKTIF", "SELESAI"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`h-9 shrink-0 rounded-xl px-3 text-xs font-semibold transition-colors ${statusFilter === status ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>{status === "SEMUA" ? "Semua" : status === "AKTIF" ? "Aktif" : "Selesai"}</button>)}
					</div>
				</section>

			<div className="flex items-center justify-between px-1">
				<div><h3 className="text-sm font-bold text-foreground">Daftar shift</h3><p className="text-[11px] text-muted-foreground">Pilih baris untuk lihat detail.</p></div>
				<div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{visibleRows.length} shift</span>{someSelected && <button type="button" onClick={() => setConfirmDeleteIds(Array.from(selectedIds))} className="inline-flex h-8 items-center gap-1 rounded-lg bg-destructive/10 px-2.5 text-[11px] font-bold text-destructive hover:bg-destructive/20"><Trash2 className="h-3 w-3" /> Hapus {selectedIds.size}</button>}</div>
			</div>

			{/* Mobile list */}
			<div className="space-y-2 lg:hidden">
				{visibleRows.map((shift) => { const isSelected = shift.startTime === selectedShift?.startTime; return <article key={shift.shiftId} onClick={() => { setSelectedShiftStart(shift.startTime); setMobileDetailOpen(true); }} className={`rounded-2xl border bg-card p-3 transition-all active:scale-[.99] ${isSelected ? "border-primary ring-2 ring-primary/10" : "border-border"}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedShiftStart(shift.startTime); setMobileDetailOpen(true); } }}>
					<div className="flex items-start gap-2"><input type="checkbox" checked={selectedIds.has(shift.shiftId)} onChange={() => {}} onClick={(event) => toggleRow(shift.shiftId, event as unknown as React.MouseEvent)} className="mt-1 h-4 w-4 accent-primary" aria-label={`Pilih ${shift.shiftName}`} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${shift.status === "AKTIF" ? "bg-emerald-500" : "bg-slate-300"}`} /><h4 className="truncate text-sm font-bold">{shift.shiftName}</h4><span className="ml-auto text-[10px] font-bold text-muted-foreground">{shift.status}</span></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{shift.cashierName || "Kasir belum diisi"} · {formatCompactRange(shift.startTime, shift.endTime)}</p></div><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div>
					<div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2"><div><p className="text-[10px] text-muted-foreground">Net</p><p className="text-xs font-bold">{formatCurrencyIDR(shift.totalRevenue, true)}</p></div><div><p className="text-[10px] text-muted-foreground">Produk</p><p className="text-xs font-bold">{shift.totalItemsSold}</p></div><div><p className="text-[10px] text-muted-foreground">Pengeluaran</p><p className="text-xs font-bold text-rose-700">{formatCurrencyIDR(shift.totalExpenses, true)}</p></div></div>
				</article>; })}
			</div>

			{/* Desktop monitor table + selected detail */}
			<div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.8fr)]">
				<div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
					<div className="flex items-center justify-between border-b border-border px-3 py-2.5"><div className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-primary" aria-label="Pilih semua shift" /><span className="text-xs font-bold">Pilih semua</span></div></div>
					<div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-xs"><thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 text-left">Shift</th><th className="px-3 py-2 text-left">Kasir</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-center">Target</th><th className="px-3 py-2 text-right">Produk</th><th className="px-3 py-2 text-right">Pengeluaran</th><th className="px-3 py-2 text-right">Aksi</th></tr></thead><tbody>
						{visibleRows.map((shift) => { const isSelected = shift.startTime === selectedShift?.startTime; return <tr key={shift.shiftId} onClick={() => setSelectedShiftStart(shift.startTime)} className={`cursor-pointer border-t border-border transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}><td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${shift.status === "AKTIF" ? "bg-emerald-500" : "bg-slate-300"}`} /><div><div className="font-semibold">{shift.shiftName}</div><div className="text-[10px] text-muted-foreground">{formatCompactRange(shift.startTime, shift.endTime)}</div></div></div></td><td className="max-w-[130px] truncate px-3 py-2.5" title={shift.cashierName}>{shift.cashierName || "—"}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-primary">{formatCurrencyIDR(shift.totalRevenue, true)}</td><td className="px-3 py-2.5 text-center"><TargetStatusCell label="" hasTarget={!!shift.hasTarget} met={!!shift.isShiftTargetMet} current={shift.shiftCollected ?? shift.totalRevenue} target={shift.shiftTarget ?? 0} /></td><td className="px-3 py-2.5 text-right tabular-nums">{shift.totalItemsSold}</td><td className="whitespace-nowrap px-3 py-2.5 text-right text-rose-700">{formatCurrencyIDR(shift.totalExpenses, true)}</td><td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><button type="button" onClick={(event) => openEdit(shift, event)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted" aria-label="Edit shift"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setConfirmDeleteIds([shift.shiftId])} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10" aria-label="Hapus shift"><Trash2 className="h-3.5 w-3.5" /></button></div></td></tr>; })}
					</tbody></table></div>
				</div>

				<div className="min-w-0 rounded-2xl border border-border bg-card"><div className="flex items-start justify-between border-b border-border px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Detail terpilih</p><h3 className="truncate text-sm font-bold">{selectedShift?.shiftName || "Pilih shift"}</h3><p className="truncate text-[11px] text-muted-foreground">{selectedShift?.cashierName || "Kasir belum diisi"} · {selectedShift ? formatDateTime(selectedShift.startTime) : "—"}</p></div><button type="button" onClick={async () => { if (summaryText) { await navigator.clipboard.writeText(summaryText); toast.success("Ringkasan shift disalin"); } }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"><Copy className="h-3 w-3" /> Salin</button></div>
					{selectedShift && <div className="space-y-2 p-3"><div className="grid grid-cols-2 gap-1.5"><MiniStat icon={Wallet} label="Net" value={formatCurrencyIDR(selectedShift.totalRevenue, true)} /><MiniStat icon={ReceiptText} label="Bruto" value={formatCurrencyIDR(selectedShift.totalGrossSales, true)} /><MiniStat icon={Clock3} label="Durasi" value={`${formatTime(selectedShift.startTime)}–${formatTime(selectedShift.endTime)}`} /><MiniStat icon={CheckCircle2} label="Status" value={selectedShift.status} /></div><div className="rounded-lg border border-border bg-muted/20 p-2.5"><div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Target</div>{selectedShift.hasTarget ? <div className="space-y-2"><TargetLine label="Shift" met={!!selectedShift.isShiftTargetMet} current={selectedShift.shiftCollected ?? selectedShift.totalRevenue} target={selectedShift.shiftTarget ?? 0} /><TargetLine label="Harian" met={!!selectedShift.isDailyTargetMet} current={selectedShift.dailyCollected ?? 0} target={selectedShift.dailyTarget ?? 0} />{selectedShift.memberBonuses?.length ? <BonusTierPanel bonuses={selectedShift.memberBonuses} /> : null}</div> : <p className="text-xs text-muted-foreground">Belum ada target untuk periode ini.</p>}</div><div className="grid grid-cols-2 gap-1.5"><DetailBlock title="Pembayaran" items={[["Modal", formatCurrencyIDR(selectedShift.startingCash, true)], ["Tunai", formatCurrencyIDR(selectedShift.cashRevenue, true)], ["QRIS", formatCurrencyIDR(selectedShift.qrisRevenue, true)]]} /><DetailBlock title="Aktivitas" items={[["Produk", `${selectedShift.totalItemsSold} item`], ["Transaksi", `${selectedShift.orderCount}`], ["Pengeluaran", formatCurrencyIDR(selectedShift.totalExpenses, true)]]} /></div>{details?.topProducts?.length ? <div className="rounded-xl border border-border p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Produk teratas</p>{details.topProducts.slice(0, 3).map((item: any, index: number) => <div key={`${item.productName}-${index}`} className="flex items-center justify-between border-t border-border py-1.5 text-xs first:border-0"><span className="truncate">{index + 1}. {item.productName}</span><strong>{item.quantity}</strong></div>)}</div> : null}</div>}
				</div>
			</div>

			{/* Mobile detail sheet */}
			{mobileDetailOpen && selectedShift && <div className="fixed inset-0 z-40 bg-black/30 p-3 lg:hidden" onClick={() => setMobileDetailOpen(false)}><div className="absolute inset-x-3 bottom-3 max-h-[82dvh] overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Detail shift</p><h3 className="text-base font-bold">{selectedShift.shiftName}</h3></div><button type="button" onClick={() => setMobileDetailOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border" aria-label="Tutup detail"><X className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-1.5"><MiniStat icon={Wallet} label="Net" value={formatCurrencyIDR(selectedShift.totalRevenue, true)} /><MiniStat icon={ReceiptText} label="Bruto" value={formatCurrencyIDR(selectedShift.totalGrossSales, true)} /><MiniStat icon={Clock3} label="Durasi" value={`${formatTime(selectedShift.startTime)}–${formatTime(selectedShift.endTime)}`} /><MiniStat icon={CheckCircle2} label="Status" value={selectedShift.status} /></div><div className="mt-3 grid grid-cols-2 gap-2"><DetailBlock title="Pembayaran" items={[["Modal", formatCurrencyIDR(selectedShift.startingCash, true)], ["Tunai", formatCurrencyIDR(selectedShift.cashRevenue, true)], ["QRIS", formatCurrencyIDR(selectedShift.qrisRevenue, true)]]} /><DetailBlock title="Aktivitas" items={[["Produk", `${selectedShift.totalItemsSold} item`], ["Transaksi", `${selectedShift.orderCount}`], ["Pengeluaran", formatCurrencyIDR(selectedShift.totalExpenses, true)]]} /></div></div></div>}
			</div>

		{/* ── DELETE CONFIRMATION DIALOG ── */}
		{confirmDeleteIds && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
				<div className="w-full max-w-sm rounded-[20px] border border-border bg-card shadow-2xl p-4 space-y-4">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
							<Trash2 className="h-5 w-5 text-destructive" />
						</div>
						<div>
							<h3 className="font-bold text-base text-foreground">Hapus Shift?</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								{confirmDeleteIds.length === 1
									? "Data shift ini akan dihapus permanen dan tidak dapat dikembalikan."
									: `${confirmDeleteIds.length} data shift akan dihapus permanen dan tidak dapat dikembalikan.`}
							</p>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							type="button"
							onClick={() => setConfirmDeleteIds(null)}
							disabled={isDeleting}
							className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => void handleDeleteConfirmed()}
							disabled={isDeleting}
							className="rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
						>
							{isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Hapus
						</button>
					</div>
				</div>
			</div>
		)}

		{/* ── EDIT SHIFT DIALOG ── */}
		{editingShift && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
				<div className="w-full max-w-md rounded-[20px] border border-border bg-card shadow-2xl">
					<div className="flex items-center justify-between border-b border-border px-5 py-4">
						<div>
							<h3 className="font-bold text-base text-foreground">Edit Shift</h3>
							<p className="text-xs text-muted-foreground mt-0.5">
								{formatCompactRange(editingShift.startTime, editingShift.endTime)}
							</p>
						</div>
						<button
							type="button"
							onClick={() => setEditingShift(null)}
							className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<div className="p-4 space-y-4">
						{[
							{ key: "shiftName", label: "Nama Shift", type: "text", placeholder: "" },
							{ key: "cashierName", label: "Kasir", type: "text", placeholder: "" },
							{ key: "teamMembers", label: "Tim (pisah koma)", type: "text", placeholder: "Rian, Yusrina, ..." },
							{ key: "startingCash", label: "Modal Kasir (Rp)", type: "number", placeholder: "" },
						].map(({ key, label, type, placeholder }) => (
							<div key={key} className="space-y-1">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
								<input
									type={type}
									value={(editForm as any)[key]}
									onChange={(e) => setEditForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
									placeholder={placeholder}
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
								/>
							</div>
						))}
						<div className="space-y-1">
							<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Catatan</label>
							<textarea
								value={editForm.notes}
								onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
								rows={2}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end border-t border-border px-5 py-4">
						<button
							type="button"
							onClick={() => setEditingShift(null)}
							disabled={isSavingEdit}
							className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => void handleSaveEdit()}
							disabled={isSavingEdit}
							className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
						>
							{isSavingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Simpan
						</button>
					</div>
				</div>
			</div>
		)}
		{/* ── CREATE SHIFT DIALOG ── */}
		{showCreateDialog && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
				<div className="w-full max-w-md rounded-[20px] border border-border bg-card shadow-2xl">
					<div className="flex items-center justify-between border-b border-border px-5 py-4">
						<div>
							<h3 className="font-bold text-base text-foreground">Buka Shift Baru</h3>
							<p className="text-xs text-muted-foreground mt-0.5">
								Mulai sesi kasir baru
							</p>
						</div>
						<button
							type="button"
							onClick={() => setShowCreateDialog(false)}
							disabled={isCreatingShift}
							className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<div className="p-4 space-y-4">
						{[
							{ key: "shiftName", label: "Nama Shift *", type: "text", placeholder: "Shift Pagi" },
							{ key: "cashierName", label: "Kasir", type: "text", placeholder: "Nama kasir" },
							{ key: "teamMembers", label: "Tim (pisah koma)", type: "text", placeholder: "Rian, Yusrina, ..." },
							{ key: "startingCash", label: "Modal Kasir (Rp)", type: "number", placeholder: "" },
						].map(({ key, label, type, placeholder }) => (
							<div key={key} className="space-y-1">
								<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
								<input
									type={type}
									value={(createForm as any)[key]}
									onChange={(e) => setCreateForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
									placeholder={placeholder}
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
								/>
							</div>
						))}
						<div className="space-y-1">
							<label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Catatan</label>
							<textarea
								value={createForm.notes}
								onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
								rows={2}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end border-t border-border px-5 py-4">
						<button
							type="button"
							onClick={() => setShowCreateDialog(false)}
							disabled={isCreatingShift}
							className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
						>
							Batal
						</button>
						<button
							type="button"
							onClick={() => void handleCreateShift()}
							disabled={isCreatingShift}
							className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
						>
							{isCreatingShift && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Buka Shift
						</button>
					</div>
				</div>
			</div>
		)}
		</>
	);
}

function CommandMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
	return (
		<div className="flex min-h-[92px] min-w-0 flex-col justify-center px-3 py-3 first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5">
			<p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
			<p className="mt-2 truncate text-base font-bold leading-none tracking-tight text-foreground sm:text-lg">{value}</p>
			<p className="mt-2 truncate text-[10px] leading-none text-muted-foreground">{helper}</p>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	helper,
}: {
	icon: typeof Wallet;
	label: string;
	value: string;
	helper: string;
}) {
	return (
		<div className="rounded-[20px] border border-border bg-card p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
					{label}
				</p>
				<div className="rounded-xl bg-primary/10 p-2 text-primary">
					<Icon className="h-4 w-4" />
				</div>
			</div>
			<p className="mt-4 text-xl font-black tracking-tight text-foreground">
				{value}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{helper}</p>
		</div>
	);
}

function TableHead({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<th
			className={`whitespace-nowrap px-1.5 py-1.5 text-[11px] font-semibold leading-3 tracking-[0.1em] ${className ?? ""}`}
		>
			{children}
		</th>
	);
}

function TableCell({
	children,
	className = "",
	title,
}: {
	children: React.ReactNode;
	className?: string;
	title?: string;
}) {
	return (
		<td className={`whitespace-nowrap px-1.5 py-1 align-middle leading-4 ${className}`} title={title}>
			{children}
		</td>
	);
}

function MiniStat({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Wallet;
	label: string;
	value: string;
}) {
	return (
		<div className="flex min-h-[58px] flex-col justify-between rounded-lg border border-border bg-background p-2">
			<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				<Icon className="h-3 w-3" />
				{label}
			</div>
			<p className="mt-1 text-sm font-bold leading-none text-foreground">{value}</p>
		</div>
	);
}

function BonusTierPanel({ bonuses }: { bonuses: MemberBonusInfo[] }) {
	const basisLabels = { shift: "Shift", daily: "Harian", monthly: "Bulanan" } as const;
	return (
		<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
			<p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Bonus Bertingkat</p>
			<div className="space-y-1.5">
				{bonuses.map((member) => (
					<div key={`${member.name}-${member.roleName}`} className="rounded-md border border-amber-200/70 bg-white/70 p-1.5 text-[10px]">
						<div className="flex items-center justify-between gap-2 font-semibold text-foreground"><span className="truncate">{member.name} · {member.roleName}</span><span className="shrink-0 text-amber-800">{formatCurrencyIDR(member.bonus, true)}</span></div>
						<div className="mt-0.5 text-muted-foreground">Basis {basisLabels[member.basis]} · {member.achievedTiers.length ? `Tier tercapai: ${member.achievedTiers.join("%, ")}%` : "Belum mencapai tier"}</div>
						{member.allTiers.length > 0 && <div className="mt-0.5 text-muted-foreground">{member.allTiers.map((tier) => `${tier.thresholdPct}% ${formatCurrencyIDR(tier.bonusAmount, true)}`).join(" · ")}</div>}
					</div>
				))}
			</div>
		</div>
	);
}

function TargetLine({ label, met, current, target }: { label: string; met: boolean; current: number; target: number }) {
	const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
	return (
		<div>
			<div className="flex items-center justify-between text-xs">
				<span className="font-semibold">Target {label}</span>
				<span className={met ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{met ? "Tercapai" : "Belum"} · {progress}%</span>
			</div>
			<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${met ? "bg-emerald-500" : "bg-rose-400"}`} style={{ width: `${progress}%` }} /></div>
			<div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{formatCurrencyIDR(current, true)}</span><span>{formatCurrencyIDR(target, true)}</span></div>
		</div>
	);
}

function TargetStatusCell({
	label,
	hasTarget,
	met,
	current,
	target,
}: {
	label: string;
	hasTarget: boolean;
	met: boolean;
	current: number;
	target: number;
}) {
	if (!hasTarget) {
		return <div className="min-w-[96px] whitespace-nowrap text-center text-[11px] text-muted-foreground">—</div>;
	}

	return (
		<TargetBadge
			label={label}
			met={met}
			current={current}
			target={target}
		/>
	);
}

function TargetBadge({
	label,
	met,
	current,
	target,
}: {
	label: string;
	met: boolean;
	current: number;
	target: number;
}) {
	return (
		<div
			className={`min-w-[118px] rounded-lg border px-2 py-1.5 text-[10px] leading-tight ${
				met
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: "border-rose-200 bg-rose-50 text-rose-700"
			}`}
		>
			<div className="flex items-center justify-between gap-2 whitespace-nowrap font-bold">
				<span className="inline-flex items-center gap-1">
					<span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-[10px]">{met ? "✓" : "!"}</span>
					{met ? "Tercapai" : "Belum"}
				</span>
				<span className="tabular-nums">{target > 0 ? `${Math.min(100, Math.round((current / target) * 100))}%` : "—"}</span>
			</div>
			<div className="mt-1 whitespace-nowrap border-t border-current/10 pt-1 text-[10px] font-semibold tabular-nums">
				{formatCurrencyIDR(current, true)} <span className="font-normal opacity-60">/</span> {formatCurrencyIDR(target, true)}
			</div>
		</div>
	);
}

function DetailBlock({
	title,
	items,
}: {
	title: string;
	items: Array<[string, string]>;
}) {
	return (
		<div className="min-h-[112px] rounded-xl border border-border bg-background p-2.5">
			<h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
				{title}
			</h4>
			<div className="space-y-2">
				{items.map(([label, value]) => (
					<div key={label} className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">{label}</span>
						<span className="text-right font-semibold text-foreground">{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-semibold text-foreground">{value}</span>
		</div>
	);
}
