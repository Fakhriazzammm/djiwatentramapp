import { useEffect, useMemo, useState } from "react";
import {
	BadgeDollarSign,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Copy,
	Download,
	FileText,
	Image as ImageIcon,
	Loader2,
	Mail,
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
	useHybridSendShiftReportEmail,
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
}

type BonusTier = { thresholdPct: number; bonusAmount: number };
type MemberBonusInfo = {
	name: string;
	roleName: string;
	bonus: number;
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
		"Djiwa Tentram Cafe & Resto",
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

export function ShiftReport({ range }: Props) {
	const sendShiftReportEmail = useHybridSendShiftReportEmail();
	const sendShiftTableReportEmail = useHybridSendShiftTableReportEmail();
	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Toko";
	const allRows = useHybridShiftReportRows() as ShiftRow[] | undefined;
	const allStaffUsers = useHybridStaffUsers();
	// Derive unique roles from staff users, sorted by priority
	// Baru=1, Chef=2, Kasir=3, Waitress=4, Manajer=5, Admin=6, other=99
	const sortedRoles = useMemo(() => {
		if (!allStaffUsers?.length) {
			return ["BARISTA", "CHEF", "KASIR", "MANAGER"];
		}
		const priority: Record<string, number> = {
			BARISTA: 1, CHEF: 2, KASIR: 3, WAITRESS: 4, MANAGER: 5, ADMIN: 6,
		};
		const unique = [...new Set(allStaffUsers.map((u: any) => u.roleName?.trim()).filter(Boolean))];
		unique.sort((a, b) => (priority[a] ?? 99) - (priority[b] ?? 99));
		return unique;
	}, [allStaffUsers]);
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

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(null);
	const [sendingShiftStart, setSendingShiftStart] = useState<number | null>(null);
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

		if (
			selectedShiftStart === null ||
			!rows.some((shift) => shift.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(rows[0].startTime);
		}
	}, [rows, selectedShiftStart]);

	const selectedShift =
		rows?.find((shift) => shift.startTime === selectedShiftStart) ?? rows?.[0];

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
						<Skeleton key={index} className="h-24 rounded-2xl" />
					))}
				</div>
				<Skeleton className="h-[420px] rounded-2xl" />
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground">
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

	const handleSendShiftEmail = async (shift: ShiftRow) => {
		try {
			setSendingShiftStart(shift.startTime);
			await sendShiftReportEmail({
				startTime: shift.startTime,
				endTime: shift.endTime,
			});
			toast.success(`Email laporan ${shift.shiftName} berhasil dikirim`);
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error
					? error.message
					: "Gagal mengirim email laporan shift.";
			toast.error(message);
		} finally {
			setSendingShiftStart(null);
		}
	};

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
		<div className="space-y-5">
			<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-between">
				<button
					type="button"
					onClick={() => { setCreateForm({ shiftName: "", cashierName: "", teamMembers: "", startingCash: 0, notes: "" }); setShowCreateDialog(true); }}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 sm:min-w-[112px]"
				>
					<Plus className="h-3.5 w-3.5" />
					Buka Shift
				</button>
				<div className="flex gap-2 col-span-2 sm:ml-auto sm:flex">
				<button
					type="button"
					onClick={() => void handleExport("pdf")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<FileText className="h-3.5 w-3.5" />
					PDF
				</button>
				<button
					type="button"
					onClick={() => void handleExport("csv")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<Download className="h-3.5 w-3.5" />
					CSV
				</button>
				<button
					type="button"
					onClick={() => void handleExport("jpg")}
					disabled={isExporting || !rows?.length}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40 sm:min-w-[92px]"
				>
					<ImageIcon className="h-3.5 w-3.5" />
					JPG
				</button>
				<button
					type="button"
					onClick={() => void handleSendFullReportEmail()}
					disabled={isSendingFullEmail || !rows?.length}
					className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40 sm:col-span-1 sm:min-w-[132px]"
				>
					{isSendingFullEmail ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Mail className="h-3.5 w-3.5" />
					)}
					Kirim Email
				</button>
			</div>
			</div>

			<div className="grid gap-3 md:grid-cols-4">
				<SummaryCard
					icon={Users}
					label="Total Shift"
					value={`${rows.length} shift`}
					helper={`${totals.activeCount} shift aktif`}
				/>
				<SummaryCard
					icon={Wallet}
					label="Revenue Bersih"
					value={formatCurrencyIDR(totals.totalRevenue)}
					helper={`Bruto ${formatCurrencyIDR(totals.totalGross, true)}`}
				/>
				<SummaryCard
					icon={BadgeDollarSign}
					label="Total Potongan"
					value={formatCurrencyIDR(totals.totalDiscount)}
					helper={`Pengeluaran ${formatCurrencyIDR(totals.totalExpenses, true)}`}
				/>
				<SummaryCard
					icon={TrendingUp}
					label="Produk Terjual"
					value={`${totals.totalItems} item`}
					helper={range.label}
				/>
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
				<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<div>
							<h3 className="font-bold text-base">Tabel Laporan Shift</h3>
							<p className="text-xs text-muted-foreground">
								Klik baris untuk detail · centang untuk pilih · edit/hapus via tombol aksi.
							</p>
						</div>
						<div className="flex items-center gap-2">
							{someSelected && (
								<div className="flex items-center gap-1.5">
									<span className="text-[11px] font-semibold text-muted-foreground">{selectedIds.size} dipilih</span>
									<button
										type="button"
										onClick={() => setConfirmDeleteIds(Array.from(selectedIds))}
										className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive hover:bg-destructive/20 transition-colors"
									>
										<Trash2 className="h-3 w-3" /> Hapus Terpilih
									</button>
									<button
										type="button"
										onClick={() => setSelectedIds(new Set())}
										className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
									>
										<X className="h-3 w-3" /> Batal
									</button>
								</div>
							)}
							<div className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
								{rows.length} data
							</div>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-[1380px] w-full border-collapse text-[11px]">
							<thead className="bg-muted/40 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
								<tr>
									<th className="w-6 px-1.5 py-1.5">
										<input
											type="checkbox"
											checked={allSelected}
											onChange={toggleAll}
											className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
											aria-label="Pilih semua"
										/>
									</th>
									<TableHead>Tanggal</TableHead>
									<TableHead>Shift</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Kasir</TableHead>
									{sortedRoles.map(r => (
										<TableHead key={r}>{r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()}</TableHead>
									))}
									<TableHead>Modal</TableHead>
									<TableHead>Tunai</TableHead>
									<TableHead>Debit/QRIS</TableHead>
									<TableHead>Bruto</TableHead>
									<TableHead>Diskon</TableHead>
									<TableHead>Net</TableHead>
									<TableHead>Target Shift</TableHead>
									<TableHead>Target Harian</TableHead>
									<TableHead className="text-emerald-700">Bonus Tim</TableHead>
									<TableHead>Pengeluaran</TableHead>
									<TableHead>Produk</TableHead>
									<TableHead>Catatan</TableHead>
									<TableHead>Aksi</TableHead>
								</tr>
							</thead>
							<tbody>
								{rows.map((shift) => {
									const isSelected = shift.startTime === selectedShift?.startTime;
									const isChecked = selectedIds.has(shift.shiftId);
									return (
										<tr
											key={shift.shiftId}
											className={`cursor-pointer border-t border-border transition-colors ${
												isChecked
													? "bg-primary/5"
													: isSelected
													? "bg-primary/3"
													: "hover:bg-muted/30"
											}`}
											onClick={() => setSelectedShiftStart(shift.startTime)}
										>
											<td className="px-1.5 py-1" onClick={(e) => toggleRow(shift.shiftId, e)}>
												<input
													type="checkbox"
													checked={isChecked}
													onChange={() => {}}
													className="h-3 w-3 cursor-pointer rounded border-border accent-primary"
													aria-label={`Pilih ${shift.shiftName}`}
												/>
											</td>
											<TableCell>
												<div className="font-semibold text-foreground whitespace-nowrap">
													{formatCompactRange(shift.startTime, shift.endTime)}
												</div>
											</TableCell>
											<TableCell className="font-medium whitespace-nowrap">
												{shift.shiftName}
											</TableCell>
											<TableCell>
												<span
													className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-3 ${
														shift.status === "AKTIF"
															? "bg-emerald-100 text-emerald-700"
															: "bg-slate-100 text-slate-700"
														}`}
												>
													{shift.status}
												</span>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												{shift.cashierName || "-"}
											</TableCell>
											{(() => {
												if (!shift.teamMembers) return sortedRoles.map(r => <TableCell key={r} className="text-muted-foreground">-</TableCell>);
												const names = shift.teamMembers.split(",").map((n: string) => n.trim()).filter(Boolean);
												if (!names.length) return sortedRoles.map(r => <TableCell key={r} className="text-muted-foreground">-</TableCell>);
												if (!allStaffUsers?.length) {
													return sortedRoles.map((r, i) => (
														<TableCell key={r}>{i === 0 ? shift.teamMembers : <span className="text-muted-foreground">-</span>}</TableCell>
													));
												}
												const grouped = new Map<string, string[]>();
												names.forEach((name: string) => {
													const user = allStaffUsers.find((u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase());
													const role = user?.roleName?.trim() || "Lainnya";
													if (!grouped.has(role)) grouped.set(role, []);
													grouped.get(role)!.push(name);
												});
												return sortedRoles.map(role => {
													const members = grouped.get(role) || [];
													return (
														<TableCell key={role}>
															{members.length > 0 ? members.join(", ") : <span className="text-muted-foreground">-</span>}
														</TableCell>
													);
												});
											})()}
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.startingCash, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.cashRevenue, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.qrisRevenue, true)}</TableCell>
											<TableCell className="whitespace-nowrap">{formatCurrencyIDR(shift.totalGrossSales, true)}</TableCell>
											<TableCell className="whitespace-nowrap text-amber-700">
												-{formatCurrencyIDR(shift.totalDiscount, true)}
											</TableCell>
											<TableCell className="whitespace-nowrap font-bold text-primary">
												{formatCurrencyIDR(shift.totalRevenue, true)}
											</TableCell>
											<TableCell>
												<TargetStatusCell
													label="Shift"
													hasTarget={!!shift.hasTarget}
													met={!!shift.isShiftTargetMet}
													current={shift.shiftCollected ?? shift.totalRevenue}
													target={shift.shiftTarget ?? 0}
												/>
											</TableCell>
											<TableCell>
												<TargetStatusCell
													label="Harian"
													hasTarget={!!shift.hasTarget}
													met={!!shift.isDailyTargetMet}
													current={shift.dailyCollected ?? 0}
													target={shift.dailyTarget ?? 0}
												/>
											</TableCell>
											<TableCell>
												{shift.memberBonuses && shift.memberBonuses.some((m) => m.bonus > 0) ? (
													<div className="space-y-0.5">
														{shift.memberBonuses.filter((m) => m.bonus > 0).map((m) => (
															<div key={m.name} className="flex items-center gap-1 text-[9px] whitespace-nowrap">
																<span className="font-bold text-emerald-700 dark:text-emerald-400">{m.name.split(" ")[0]}</span>
																<span className="text-emerald-600 font-semibold">+{formatCurrencyIDR(m.bonus, true)}</span>
															</div>
														))}
													</div>
												) : (
													<span className="text-[9px] text-muted-foreground/50">—</span>
												)}
											</TableCell>
											<TableCell className="whitespace-nowrap text-rose-700">
												{formatCurrencyIDR(shift.totalExpenses, true)}
											</TableCell>
											<TableCell className="whitespace-nowrap text-center">
												{shift.totalItemsSold}
											</TableCell>
											<TableCell className="max-w-[120px] truncate text-muted-foreground/80 text-[10px]" title={shift.notes || ""}>
												{shift.notes ? (
													<span className="text-muted-foreground/90">{shift.notes}</span>
												) : (
													<span className="text-muted-foreground/30">—</span>
												)}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
													<button
														type="button"
														onClick={(e) => openEdit(shift, e)}
														className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														title="Edit shift"
													>
														<Pencil className="h-3 w-3" />
													</button>
													<button
														type="button"
														onClick={(e) => { e.stopPropagation(); setConfirmDeleteIds([shift.shiftId]); }}
														className="inline-flex h-6 w-6 items-center justify-center rounded border border-destructive/30 bg-destructive/8 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
														title="Hapus shift"
													>
														<Trash2 className="h-3 w-3" />
													</button>
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															void handleSendShiftEmail(shift);
														}}
														disabled={sendingShiftStart === shift.startTime}
														className="inline-flex h-6 w-6 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
														title="Kirim email laporan"
													>
														{sendingShiftStart === shift.startTime ? (
															<Loader2 className="h-3 w-3 animate-spin" />
														) : (
															<Mail className="h-3 w-3" />
														)}
													</button>
												</div>
											</TableCell>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>

				<div className="space-y-4">
					<div className="rounded-2xl border border-border bg-card shadow-sm">
						<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
									Ringkasan Shift
								</p>
								<h3 className="mt-1 font-bold text-lg text-foreground">
									{selectedShift?.shiftName || "Pilih Shift"}
								</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									{selectedShift
										? `${selectedShift.cashierName || "Kasir"} • ${formatDateTime(
												selectedShift.startTime,
											)}`
										: "Klik tabel di kiri untuk membuka detail laporan."}
								</p>
							</div>
							<button
								type="button"
								onClick={async () => {
									if (!summaryText) return;
									await navigator.clipboard.writeText(summaryText);
									toast.success("Ringkasan shift berhasil disalin");
								}}
								className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
							>
								<Copy className="h-3.5 w-3.5" />
								Salin
							</button>
						</div>

						{selectedShift ? (
							<div className="space-y-4 p-4">
								<div className="grid gap-3 sm:grid-cols-2">
									<MiniStat
										icon={Wallet}
										label="Revenue Bersih"
										value={formatCurrencyIDR(selectedShift.totalRevenue)}
									/>
									<MiniStat
										icon={ReceiptText}
										label="Penjualan Bruto"
										value={formatCurrencyIDR(selectedShift.totalGrossSales)}
									/>
									<MiniStat
										icon={CheckCircle2}
										label="Kasir"
										value={selectedShift.cashierName || "-"}
									/>
									<MiniStat
										icon={Clock3}
										label="Durasi"
										value={`${formatTime(selectedShift.startTime)} - ${formatTime(
											selectedShift.endTime,
										)}`}
									/>
								</div>

								<div className="rounded-2xl border border-border bg-muted/20 p-3">
									<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										<TrendingUp className="h-3.5 w-3.5" />
										Status Target
									</div>
									{selectedShift.hasTarget ? (
										<div className="grid gap-3 sm:grid-cols-2">
											<DetailBlock
												title="Target Shift"
												items={[
													["Target", formatCurrencyIDR(selectedShift.shiftTarget ?? 0)],
													["Revenue Shift", formatCurrencyIDR(selectedShift.shiftCollected ?? selectedShift.totalRevenue)],
													["Status", selectedShift.isShiftTargetMet ? "Target Tercapai" : "Target Tidak Tercapai"],
												]}
											/>
											<DetailBlock
												title="Target Harian"
												items={[
													["Target Harian", formatCurrencyIDR(selectedShift.dailyTarget ?? 0)],
													["Revenue Harian", formatCurrencyIDR(selectedShift.dailyCollected ?? 0)],
													["Status", selectedShift.isDailyTargetMet ? "Target Tercapai" : "Target Tidak Tercapai"],
												]}
											/>
										</div>
									) : (
										<p className="text-sm text-muted-foreground">
											Belum ada target keuangan bulanan untuk periode shift ini.
										</p>
									)}
								</div>

								{selectedShift.memberBonuses && selectedShift.memberBonuses.length > 0 && (
									<div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/10">
										<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
											<BadgeDollarSign className="h-3.5 w-3.5" />
											Bonus Tim Shift
										</div>
										<div className="space-y-2">
											{selectedShift.memberBonuses.map((member) => (
												<div key={member.name} className="rounded-xl bg-emerald-100/60 px-2.5 py-2 dark:bg-emerald-500/15">
													<div className="flex items-center justify-between mb-1">
														<span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">{member.name}</span>
														<span className="text-[10px] font-semibold text-emerald-700/70 dark:text-emerald-300/70 uppercase">{member.roleName}</span>
													</div>
													<div className="flex flex-wrap gap-1 mb-1">
														{member.allTiers.map((tier) => {
															const achieved = member.achievedTiers.includes(tier.thresholdPct);
															return (
																<span
																	key={tier.thresholdPct}
																	className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold border transition-all ${achieved ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white/60 text-muted-foreground/50 border-border/30 dark:bg-muted/30"}`}
																>
																	{achieved ? "✓" : "○"} {tier.thresholdPct}% → {formatCurrencyIDR(tier.bonusAmount)}
																</span>
															);
														})}
													</div>
													<p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">
														Bonus: {formatCurrencyIDR(member.bonus)}
													</p>
												</div>
											))}
										</div>
									</div>
								)}

								<div className="grid gap-3 sm:grid-cols-2">
									<DetailBlock
										title="Pembayaran"
										items={[
											["Modal Kasir", formatCurrencyIDR(selectedShift.startingCash)],
											["Tunai", formatCurrencyIDR(selectedShift.cashRevenue)],
											["Debit/QRIS", formatCurrencyIDR(selectedShift.qrisRevenue)],
											["Lainnya", formatCurrencyIDR(selectedShift.otherRevenue)],
										]}
									/>
									<DetailBlock
										title="Operasional"
										items={[
											["Penjualan Bruto", formatCurrencyIDR(selectedShift.totalGrossSales)],
											["Diskon", formatCurrencyIDR(selectedShift.totalDiscount)],
											["Revenue Bersih", formatCurrencyIDR(selectedShift.totalRevenue)],
											["Pengeluaran", formatCurrencyIDR(selectedShift.totalExpenses)],
										]}
									/>
								</div>

								<div className="rounded-2xl border border-border bg-muted/20 p-3">
									<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										<CalendarDays className="h-3.5 w-3.5" />
										Informasi Shift
									</div>
									<div className="grid gap-2 text-sm sm:grid-cols-2">
										<InfoRow label="Status" value={selectedShift.status} />
										<InfoRow
											label="Total Produk"
											value={`${selectedShift.totalItemsSold} item`}
										/>
										{(() => {
											if (!selectedShift.teamMembers) return <InfoRow label="Tim" value="-" />;
											const names = selectedShift.teamMembers.split(",").map((n: string) => n.trim()).filter(Boolean);
											if (!names.length) return <InfoRow label="Tim" value="-" />;
											if (!allStaffUsers?.length) return <InfoRow label="Tim" value={selectedShift.teamMembers} />;
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
											return (
												<div className="flex flex-col gap-1 rounded-xl bg-background px-3 py-2">
													{sortedRoles.map(role => {
														const formattedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
														return (
															<div key={role} className="flex items-center justify-between gap-3 text-sm">
																<span className="text-muted-foreground">{formattedRole}</span>
																<span className="text-right font-semibold text-foreground">{grouped.get(role)!.join(", ")}</span>
															</div>
														);
													})}
												</div>
											);
										})()}
										<InfoRow
											label="Transaksi POS"
											value={`${selectedShift.orderCount} transaksi`}
										/>
									</div>
								</div>

								<div className="grid gap-3">
									<div className="rounded-2xl border border-border bg-background p-3">
										<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
											Top Produk
										</h4>
										{details === undefined ? (
											<Skeleton className="h-20 rounded-xl" />
										) : details?.topProducts?.length ? (
											<div className="space-y-2">
												{details.topProducts.map((item: any, index: number) => (
													<div
														key={`${item.productName}-${index}`}
														className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
													>
														<div className="flex items-center gap-2">
															<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
																{index + 1}
															</span>
															<span className="font-medium text-foreground">
																{item.productName}
															</span>
														</div>
														<span className="text-sm font-bold text-primary">
															{item.quantity}
														</span>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">Belum ada produk terjual.</p>
										)}
									</div>

									<div className="rounded-2xl border border-border bg-background p-3">
										<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
											Rincian Produk per Kategori
										</h4>
										{details === undefined ? (
											<Skeleton className="h-28 rounded-xl" />
										) : details?.productBreakdown?.length ? (
											<div className="space-y-3">
												{details.productBreakdown.map((category: any) => (
													<div key={category.categoryName} className="rounded-xl border border-border bg-muted/20 p-3">
														<div className="mb-2 flex items-center justify-between">
															<p className="font-semibold text-foreground">
																{category.categoryName}
															</p>
															<span className="text-xs font-bold text-primary">
																{category.totalQuantity} item
															</span>
														</div>
														<div className="space-y-1.5">
															{category.items.map((item: any) => (
																<div
																	key={`${category.categoryName}-${item.productName}`}
																	className="flex items-center justify-between text-sm"
																>
																	<span className="text-muted-foreground">
																		{item.productName}
																	</span>
																	<span className="font-semibold text-foreground">
																		{item.quantity}
																	</span>
																</div>
															))}
														</div>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">Belum ada rincian produk.</p>
										)}
									</div>
								</div>

								<div className="rounded-2xl border border-border bg-slate-950 p-3 text-slate-50 shadow-inner">
									<div className="mb-3 flex items-center justify-between">
										<h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
											Format Ringkasan
										</h4>
										<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
											Siap salin
										</span>
									</div>
									<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">
										{summaryText}
									</pre>
								</div>
							</div>
						) : (
							<div className="p-4 text-sm text-muted-foreground">
								Pilih salah satu shift pada tabel untuk melihat ringkasan.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>

		{/* ── DELETE CONFIRMATION DIALOG ── */}
		{confirmDeleteIds && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
				<div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-5 space-y-4">
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
				<div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
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
					<div className="p-5 space-y-4">
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
				<div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
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
					<div className="p-5 space-y-4">
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
		<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
			className={`whitespace-nowrap px-1.5 py-1.5 text-[9px] font-semibold leading-3 tracking-[0.1em] ${className ?? ""}`}
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
		<div className="rounded-2xl border border-border bg-background p-3">
			<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</div>
			<p className="mt-2 text-base font-bold text-foreground">{value}</p>
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
		return (
			<div className="whitespace-nowrap text-xs text-muted-foreground">
				Belum ada target
			</div>
		);
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
			className={`rounded-md border px-1.5 py-1 text-[9px] leading-3 ${
				met
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: "border-rose-200 bg-rose-50 text-rose-700"
			}`}
		>
			<div className="flex items-center justify-between gap-1.5 font-bold">
				<span>{label}</span>
				<span>{met ? "✓" : "✗"}</span>
			</div>
			<div className="mt-0.5 text-[8px] font-medium opacity-90">
				{formatCurrencyIDR(current, true)} / {formatCurrencyIDR(target, true)}
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
		<div className="rounded-2xl border border-border bg-background p-3">
			<h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
