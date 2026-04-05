import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useEffect } from "react";
import { Wallet, Pencil, Trash2, Search, Filter, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import type { DateRange } from "../../reports/-components/period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import { toast } from "sonner";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";

const EXPENSE_CATEGORIES = [
	"makanan_minuman",
	"belanja_stok",
	"peralatan_kantor",
	"transportasi",
	"utilitas_listrik_air",
	"gaji_karyawan",
	"sewa_tempat",
	"pemasaran",
	"pajak",
	"hiburan",
	"kesehatan",
	"pembangunan_renovasi",
	"lainnya",
];

interface Props {
	range: DateRange;
}

export function TransactionDetailReport({ range }: Props) {
	const [filterType, setFilterType] = useState<"income" | "expense" | undefined>(undefined);
	const [filterCategory, setFilterCategory] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [minAmount, setMinAmount] = useState<string>("");
	const [maxAmount, setMaxAmount] = useState<string>("");
	const [sortBy, setSortBy] = useState<"date" | "amount">("date");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
	const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<Id<"financialTransactions">>>(new Set());
	
	const deleteTransaction = useMutation(api.finance.deleteTransaction);
	const deleteTransactionsBulk = useMutation(api.finance.deleteTransactionsBulk);

	const data = useQuery(api.finance.getTransactionDetailReport, {
		startDate: range.startDate,
		endDate: range.endDate,
		type: filterType,
		category: filterCategory || undefined,
	});

	const historicalShifts = useQuery(api.finance.getHistoricalShifts, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	// Client-side filtering for search and amount range
	const filteredTransactions = useMemo(() => {
		if (!data?.transactions) return [];
		
		let result = [...data.transactions];

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(t => 
				t.merchant?.toLowerCase().includes(query) || 
				t.description?.toLowerCase().includes(query) ||
				t.category.toLowerCase().includes(query) ||
				t.sourceLabel?.toLowerCase().includes(query) ||
				t.referenceValue?.toLowerCase().includes(query) ||
				t.rawText?.toLowerCase().includes(query) ||
				t.metadata?.scanItems?.some((item: any) => item.name?.toLowerCase().includes(query))
			);
		}

		// Amount range filter
		if (minAmount) {
			result = result.filter(t => t.amount >= Number(minAmount));
		}
		if (maxAmount) {
			result = result.filter(t => t.amount <= Number(maxAmount));
		}

		// Sorting
		result.sort((a, b) => {
			if (sortBy === "date") {
				return sortOrder === "asc" ? a.date - b.date : b.date - a.date;
			} else {
				return sortOrder === "asc" ? a.amount - b.amount : b.amount - a.amount;
			}
		});

		return result;
	}, [data?.transactions, searchQuery, minAmount, maxAmount, sortBy, sortOrder]);

	const filteredTransactionIds = useMemo(
		() => filteredTransactions.map((transaction) => transaction._id as Id<"financialTransactions">),
		[filteredTransactions]
	);

	const selectedVisibleCount = useMemo(
		() => filteredTransactionIds.filter((id) => selectedTransactionIds.has(id)).length,
		[filteredTransactionIds, selectedTransactionIds]
	);

	const allVisibleSelected = filteredTransactionIds.length > 0 && selectedVisibleCount === filteredTransactionIds.length;

	useEffect(() => {
		setSelectedTransactionIds((prev) => {
			if (prev.size === 0) return prev;
			const filteredIdSet = new Set(filteredTransactionIds);
			const next = new Set([...prev].filter((id) => filteredIdSet.has(id)));
			return next.size === prev.size ? prev : next;
		});
	}, [filteredTransactionIds]);

	const categoryBadge = (category: string, type: string) => {
		const colorMap: Record<string, string> = {
			makanan_minuman: "border-orange-200 bg-orange-50 text-orange-700",
			belanja_stok: "border-blue-200 bg-blue-50 text-blue-700",
			peralatan_kantor: "border-purple-200 bg-purple-50 text-purple-700",
			utilitas_listrik_air: "border-yellow-200 bg-yellow-50 text-yellow-700",
			transportasi: "border-cyan-200 bg-cyan-50 text-cyan-700",
			Penjualan: "border-green-200 bg-green-50 text-green-700",
		};
		const color = colorMap[category] || "border-gray-200 bg-gray-50 text-gray-700";
		return (
			<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`}>
				{category.replace(/_/g, " ")}
			</span>
		);
	};

	const handleDelete = async (id: Id<"financialTransactions">) => {
		if (!confirm("Apakah Anda yakin ingin menghapus transaksi ini?")) return;
		try {
			await deleteTransaction({ id });
			setSelectedTransactionIds((prev) => {
				if (!prev.has(id)) return prev;
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			toast.success("Transaksi berhasil dihapus");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus transaksi");
		}
	};

	const sourceBadge = (sourceLabel?: string, sourceType?: string) => {
		const colorMap: Record<string, string> = {
			ai_bulk_finance: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
			ai_tool: "border-violet-200 bg-violet-50 text-violet-700",
			ai_receipt_scan: "border-sky-200 bg-sky-50 text-sky-700",
			manual: "border-slate-200 bg-slate-50 text-slate-700",
		};
		const color = colorMap[sourceType || "manual"] || "border-slate-200 bg-slate-50 text-slate-700";
		return (
			<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${color}`}>
				{sourceLabel || "Manual"}
			</span>
		);
	};

	const handleToggleRow = (id: Id<"financialTransactions">) => {
		setSelectedTransactionIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleToggleSelectAll = () => {
		setSelectedTransactionIds((prev) => {
			const next = new Set(prev);
			if (allVisibleSelected) {
				for (const id of filteredTransactionIds) {
					next.delete(id);
				}
			} else {
				for (const id of filteredTransactionIds) {
					next.add(id);
				}
			}
			return next;
		});
	};

	const handleBulkDelete = async () => {
		const idsToDelete = filteredTransactionIds.filter((id) => selectedTransactionIds.has(id));
		if (idsToDelete.length === 0) return;
		if (!confirm(`Hapus ${idsToDelete.length} transaksi terpilih? Aksi ini tidak dapat dibatalkan.`)) return;

		try {
			await deleteTransactionsBulk({ ids: idsToDelete });
			setSelectedTransactionIds(new Set());
			toast.success(`${idsToDelete.length} transaksi berhasil dihapus`);
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus transaksi terpilih");
		}
	};

	const handleEdit = (transaction: any) => {
		setSelectedTransaction(transaction);
		setIsEditDialogOpen(true);
	};

	const getReferenceHref = (transaction: any) => {
		const referenceValue = String(
			transaction.referenceValue || transaction.metadata?.sourceRef || ""
		).trim();
		const referenceLabel = String(transaction.referenceLabel || "").toLowerCase();

		if (!referenceValue) {
			return null;
		}

		if (
			referenceLabel.includes("booking") ||
			referenceValue.toUpperCase().startsWith("BK")
		) {
			return `/admin/orders?focusBooking=${encodeURIComponent(referenceValue)}`;
		}

		if (
			referenceLabel.includes("order") ||
			referenceLabel.includes("pesanan") ||
			referenceValue.toUpperCase().startsWith("ORD")
		) {
			return `/admin/orders?focusOrder=${encodeURIComponent(referenceValue)}`;
		}

		if (
			referenceLabel.includes("stok") ||
			referenceLabel.includes("inventory") ||
			referenceLabel.includes("bahan")
		) {
			return "/admin/inventory";
		}

		if (
			referenceLabel.includes("produk") ||
			referenceLabel.includes("product")
		) {
			return "/admin/products";
		}

		return null;
	};

	return (
		<div className="space-y-4 p-4">
			{/* Filters & Search */}
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap gap-2 items-center justify-between">
					<div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
						{(["all", "income", "expense"] as const).map((t) => (
							<button
								key={t}
							type="button"
							onClick={() => setFilterType(t === "all" ? undefined : t)}
							className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
								(t === "all" && !filterType) || filterType === t
									? t === "income"
										? "bg-green-600 text-white shadow-sm"
										: t === "expense"
											? "bg-red-600 text-white shadow-sm"
											: "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`}
						>
							{t === "all" ? "Semua" : t === "income" ? "Pemasukan" : "Pengeluaran"}
						</button>
					))}
					</div>

					<div className="flex items-center gap-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
							<input
								type="text"
								placeholder="Cari transaksi..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							/>
						</div>
						<select
							value={filterCategory}
							onChange={(e) => setFilterCategory(e.target.value)}
							className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="">Semua Kategori</option>
							{EXPENSE_CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat.replace(/_/g, " ")}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-4 bg-muted/20 p-3 rounded-lg border border-border/50">
					<div className="flex items-center gap-2">
						<Filter className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Nominal:</span>
						<div className="flex items-center gap-1.5">
							<input
								type="number"
								placeholder="Min"
								value={minAmount}
								onChange={(e) => setMinAmount(e.target.value)}
								className="h-8 w-24 rounded-md border border-input bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
							/>
							<span className="text-muted-foreground">-</span>
							<input
								type="number"
								placeholder="Max"
								value={maxAmount}
								onChange={(e) => setMaxAmount(e.target.value)}
								className="h-8 w-24 rounded-md border border-input bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
					</div>

					<div className="h-4 w-px bg-border hidden md:block" />

					<div className="flex items-center gap-2">
						<ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Urutkan:</span>
						<div className="flex gap-1">
							<button
								onClick={() => {
									if (sortBy === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
									else setSortBy("date");
								}}
								className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${sortBy === 'date' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
							>
								Tanggal {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
							</button>
							<button
								onClick={() => {
									if (sortBy === "amount") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
									else setSortBy("amount");
								}}
								className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${sortBy === 'amount' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
							>
								Nominal {sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
							</button>
						</div>
					</div>
					
					{(searchQuery || minAmount || maxAmount || filterCategory) && (
						<button 
							onClick={() => {
								setSearchQuery("");
								setMinAmount("");
								setMaxAmount("");
								setFilterCategory("");
							}}
							className="text-[10px] text-primary hover:underline ml-auto"
						>
							Reset Filter
						</button>
					)}
				</div>
			</div>

			{/* Summary */}
			{data && (
				<div className="flex flex-wrap gap-4 rounded-xl border border-border bg-muted/20 px-6 py-4 text-sm">
					<div>
						<span className="text-muted-foreground">Total Pemasukan: </span>
						<span className="font-bold text-green-600">{formatCurrencyIDR(data.totalIncome)}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Total Pengeluaran: </span>
						<span className="font-bold text-red-600">{formatCurrencyIDR(data.totalExpense)}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Saldo Bersih: </span>
						<span className={`font-bold ${data.netBalance >= 0 ? "text-blue-600" : "text-red-600"}`}>
							{formatCurrencyIDR(data.netBalance)}
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Jumlah Transaksi: </span>
						<span className="font-bold">{data.count}</span>
					</div>
				</div>
			)}

			{selectedVisibleCount > 0 && (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
					<p className="text-sm text-foreground">
						<span className="font-semibold">{selectedVisibleCount}</span> transaksi dipilih
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setSelectedTransactionIds(new Set())}
							className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
						>
							Batal Pilih
						</button>
						<button
							type="button"
							onClick={handleBulkDelete}
							className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
						>
							<Trash2 className="h-3.5 w-3.5" />
							Hapus Terpilih
						</button>
					</div>
				</div>
			)}

			{data && (
				<div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
					<span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-foreground">
						{filteredTransactions.length} baris tampil
					</span>
					<span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-medium text-violet-700">
						{filteredTransactions.filter((t: any) => String(t.sourceType || "").startsWith("ai_")).length} transaksi AI
					</span>
					<span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700">
						{filteredTransactions.filter((t: any) => t.referenceValue).length} punya referensi
					</span>
					<span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
						{filteredTransactions.filter((t: any) => t.status === "completed").length} selesai
					</span>
				</div>
			)}

			{/* Transactions Table */}
			<div className="rounded-xl border border-border overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1440px] text-left text-sm">
						<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider font-bold">
							<tr>
								<th className="px-4 py-3">
									<div className="flex items-center justify-center">
										<Checkbox
											checked={allVisibleSelected}
											onCheckedChange={handleToggleSelectAll}
											aria-label="Pilih semua transaksi di tabel"
											disabled={filteredTransactionIds.length === 0}
											className="rounded-sm border-muted-foreground/40 bg-background data-checked:border-primary data-checked:bg-primary"
										/>
									</div>
								</th>
								<th className="px-4 py-3">Tanggal</th>
								<th className="px-4 py-3">Tipe</th>
								<th className="px-4 py-3">Shift</th>
								<th className="px-4 py-3">Sumber</th>
								<th className="px-4 py-3">Merchant</th>
								<th className="px-4 py-3">Deskripsi</th>
								<th className="px-4 py-3">Referensi</th>
								<th className="px-4 py-3">Kategori</th>
								<th className="px-4 py-3">Metode</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Detail</th>
								<th className="px-4 py-3 text-right">Nominal</th>
								<th className="px-4 py-3 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border bg-card">
							{!data ? (
								Array.from({ length: 5 }).map((_, i) => (
									<tr key={i}>
										<td colSpan={14} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
									</tr>
								))
							) : filteredTransactions.length === 0 ? (
								<tr>
									<td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">
										<div className="flex flex-col items-center gap-2">
											<Wallet className="h-8 w-8 opacity-20" />
											<p>Tidak ada transaksi ditemukan</p>
										</div>
									</td>
								</tr>
							) : (
								filteredTransactions.map((t: any) => {
									let shiftName = "-";
									if (historicalShifts) {
										const shift = historicalShifts.find((s: any) => t.date >= s.startTime && (!s.endTime || t.date <= s.endTime));
										if (shift) {
											shiftName = shift.shiftName || "Shift Aktif";
										}
									}

									const referenceHref = getReferenceHref(t);

									return (
										<tr key={t._id} className="group hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => handleEdit(t)}>
											<td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
												<div className="flex items-center justify-center">
													<Checkbox
														checked={selectedTransactionIds.has(t._id)}
														onCheckedChange={() => handleToggleRow(t._id)}
														aria-label={`Pilih transaksi ${t.merchant || "Umum"} tanggal ${format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}`}
														className="rounded-sm border-muted-foreground/40 bg-background data-checked:border-primary data-checked:bg-primary"
													/>
												</div>
											</td>
											<td className="px-3 py-2.5">
												<div className="flex min-w-[88px] flex-col leading-tight">
													<span className="font-medium text-foreground text-[11px]">
														{format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}
													</span>
													<span className="text-[10px] text-muted-foreground">
														{format(new Date(t.date), "HH:mm")}
													</span>
												</div>
											</td>
											<td className="px-3 py-2.5">
												<span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
													t.type === "income"
														? "border-emerald-200 bg-emerald-50 text-emerald-700"
														: "border-rose-200 bg-rose-50 text-rose-700"
												}`}>
													{t.type === "income" ? "Pemasukan" : "Pengeluaran"}
												</span>
											</td>
											<td className="px-3 py-2.5">
												{shiftName !== "-" ? (
													<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
														{shiftName}
													</span>
												) : (
													<span className="text-[11px] text-muted-foreground">-</span>
												)}
											</td>
											<td className="px-3 py-2.5">
												<div className="flex min-w-[112px] flex-col gap-1">
													{sourceBadge(t.sourceLabel, t.sourceType)}
													{t.inputMode && (
														<span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
															{t.inputMode.replace(/_/g, " ")}
														</span>
													)}
												</div>
											</td>
											<td className="px-3 py-2.5">
												<div className="min-w-[116px] max-w-[148px]">
													<span className="block truncate text-xs font-semibold text-foreground" title={t.displayTitle || t.merchant || "Umum"}>
														{t.displayTitle || t.merchant || "Umum"}
													</span>
												</div>
											</td>
											<td className="px-3 py-2.5">
												<div className="min-w-[180px] max-w-[240px] space-y-1">
													<div className="truncate text-[11px] text-muted-foreground" title={t.displaySummary || t.description || "-"}>
														{t.displaySummary || t.description || "-"}
													</div>
													{t.rawText && (
														<div className="inline-flex max-w-full rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
															<span className="truncate" title={t.rawText}>AI input tersimpan</span>
														</div>
													)}
												</div>
											</td>
											<td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
												<div className="flex min-w-[122px] flex-col gap-0.5">
													<span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
														{t.referenceLabel || "Tanpa referensi"}
													</span>
													{referenceHref ? (
														<a
															href={referenceHref}
															className="truncate text-xs font-semibold text-primary hover:underline"
															title={`Buka ${t.referenceValue}`}
														>
															{t.referenceValue || "-"}
														</a>
													) : (
														<span className="truncate text-xs font-medium text-foreground">
															{t.referenceValue || "-"}
														</span>
													)}
													{t.metadata?.aiSessionId && (
														<span className="truncate text-[10px] text-muted-foreground">
															Sesi: {t.metadata.aiSessionId}
														</span>
													)}
											</div>
										</td>
										<td className="px-3 py-2.5">
											{categoryBadge(t.category, t.type)}
										</td>
										<td className="px-3 py-2.5">
											<span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
												{t.paymentMethod || "Cash"}
											</span>
										</td>
										<td className="px-3 py-2.5">
											<div className="flex min-w-[96px] flex-col gap-1">
												<span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
												t.status === "completed"
													? "border-emerald-200 bg-emerald-50 text-emerald-700"
													: t.status === "pending"
														? "border-amber-200 bg-amber-50 text-amber-700"
														: "border-rose-200 bg-rose-50 text-rose-700"
												}`}>
													{t.status}
												</span>
												{t.isRecurring && (
													<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
														berulang {t.recurringInterval || ""}
													</span>
												)}
											</div>
										</td>
											<td className="px-3 py-2.5">
												<div className="flex min-w-[220px] max-w-[260px] flex-wrap gap-1">
													{Array.isArray(t.detailItems) && t.detailItems.length > 0 ? (
														<>
															{t.detailItems.slice(0, Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4).map((detail: { label: string; value: string }, idx: number) => (
														<div key={`${detail.label}-${idx}`} className="inline-flex max-w-[126px] items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px]">
															<span className="font-semibold uppercase tracking-wider text-muted-foreground">
																{detail.label}:
															</span>
															<span className="truncate text-foreground" title={detail.value}>
																{detail.value}
															</span>
														</div>
															))}
															{t.detailItems.length > (Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4) && (
																<div className="inline-flex items-center rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
																	+{t.detailItems.length - (Array.isArray(t.metadata?.scanItems) && t.metadata.scanItems.length > 0 ? 6 : 4)} detail
																</div>
															)}
														</>
												) : (
													<span className="text-[11px] text-muted-foreground">-</span>
												)}
											</div>
										</td>
										<td className="px-3 py-2.5 text-right">
											<span className={`font-bold text-xs whitespace-nowrap ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
												{t.type === "income" ? "+" : "-"} {formatCurrencyIDR(t.amount)}
											</span>
										</td>
										<td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
												<div className="flex items-center justify-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleEdit(t);
														}}
														className="p-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
														title="Ubah"
													>
														<Pencil className="h-4 w-4" />
													</button>
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleDelete(t._id);
														}}
														className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
														title="Hapus"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
			
			<NewTransactionDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setSelectedTransaction(null);
				}}
				transaction={selectedTransaction}
			/>
		</div>
	);
}
