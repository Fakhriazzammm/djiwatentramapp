import { useState, useMemo, useEffect } from "react";
import {
	Search,
	Download,
	ChevronLeft,
	ChevronRight,
	ArrowUpDown,
	Receipt,
	X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyIDR } from "@/lib/export-utils";
import type { TransactionRow } from "@/lib/export-utils";
import {
	getRangeFromPeriod,
	type PeriodOption,
	type DateRange,
} from "../../reports/-components/period-selector";
import { useHybridTransactionDetailReport } from "@/hooks/use-hybrid-finance-analytics-data";
import { ExpenseDetailModal } from "./expense-detail-modal";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";
import Papa from "papaparse";

// ─── Constants ────────────────────────────────────
const PAGE_SIZE = 20;

const PERIOD_BUTTONS: Array<{ value: PeriodOption; label: string }> = [
	{ value: "today", label: "Hari Ini" },
	{ value: "this_week", label: "Minggu Ini" },
	{ value: "this_month", label: "Bulan Ini" },
	{ value: "this_year", label: "Tahun Ini" },
];

const CATEGORY_LABELS: Record<string, string> = {
	bahan_baku: "Bahan Baku",
	bahan_segar: "Bahan Segar",
	operasional: "Operasional",
	utilitas: "Utilitas",
	transportasi: "Transportasi",
	gaji: "Gaji",
	sewa: "Sewa",
	pemasaran: "Pemasaran",
	peralatan: "Peralatan",
	packaging: "Packaging",
	lainnya: "Lainnya",
	belanja: "Belanja",
};

const CATEGORY_COLORS: Record<string, string> = {
	bahan_baku: "bg-orange-100 text-orange-700",
	bahan_segar: "bg-green-100 text-green-700",
	operasional: "bg-blue-100 text-blue-700",
	utilitas: "bg-yellow-100 text-yellow-700",
	transportasi: "bg-purple-100 text-purple-700",
	gaji: "bg-red-100 text-red-700",
	sewa: "bg-slate-100 text-slate-700",
	pemasaran: "bg-pink-100 text-pink-700",
	peralatan: "bg-cyan-100 text-cyan-700",
	packaging: "bg-teal-100 text-teal-700",
	lainnya: "bg-gray-100 text-gray-700",
	belanja: "bg-indigo-100 text-indigo-700",
};

function categoryLabel(cat: string): string {
	return CATEGORY_LABELS[cat] || cat.replace(/_/g, " ");
}

function categoryColor(cat: string): string {
	return CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-700";
}

function exportExpensesCSV(transactions: TransactionRow[], period: string) {
	const data = transactions.map((t) => ({
		Tanggal: new Date(t.date).toLocaleDateString("id-ID"),
		Kategori: categoryLabel(t.category),
		Deskripsi: t.description || "-",
		Merchant: t.merchant || "-",
		Jumlah: t.amount,
		"Metode Bayar": t.paymentMethod || "-",
		Status: t.status,
	}));
	const csv = Papa.unparse(data);
	const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `pengeluaran-${Date.now()}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────
export function ExpensesTable() {
	const { setTheme } = useTheme();
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [searchQuery, setSearchQuery] = useState("");
	const [filterCategory, setFilterCategory] = useState<string>("");
	const [sortBy, setSortBy] = useState<"date" | "amount" | "category">("date");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(1);
	const [selectedTx, setSelectedTx] = useState<TransactionRow | null>(null);

	useEffect(() => {
		setTheme("light");
	}, [setTheme]);

	const txData = useHybridTransactionDetailReport({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		type: "expense",
		viewMode: "transaction",
		page: 1,
		pageSize: 2000,
	});

	const allTransactions: TransactionRow[] = (txData?.transactions || []) as TransactionRow[];

	// ── Extract unique categories ──
	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const tx of allTransactions) {
			if (tx.category) set.add(tx.category);
		}
		return Array.from(set).sort();
	}, [allTransactions]);

	// ── Filter + Search + Sort ──
	const filtered = useMemo(() => {
		let rows = [...allTransactions];

		if (filterCategory) {
			rows = rows.filter((t) => t.category === filterCategory);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			rows = rows.filter(
				(t) =>
					(t.description || "").toLowerCase().includes(q) ||
					(t.merchant || "").toLowerCase().includes(q) ||
					categoryLabel(t.category).toLowerCase().includes(q)
			);
		}

		rows.sort((a, b) => {
			let cmp = 0;
			if (sortBy === "date") cmp = a.date - b.date;
			else if (sortBy === "amount") cmp = a.amount - b.amount;
			else if (sortBy === "category") cmp = (a.category || "").localeCompare(b.category || "");
			return sortOrder === "desc" ? -cmp : cmp;
		});

		return rows;
	}, [allTransactions, filterCategory, searchQuery, sortBy, sortOrder]);

	// ── Pagination ──
	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

	// Reset page when filters change
	useEffect(() => {
		setPage(1);
	}, [dateRange, searchQuery, filterCategory]);

	const handlePeriodChange = (p: PeriodOption) => {
		setPeriod(p);
		setDateRange(getRangeFromPeriod(p));
	};

	const handleSort = (col: "date" | "amount" | "category") => {
		if (sortBy === col) {
			setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
		} else {
			setSortBy(col);
			setSortOrder("desc");
		}
	};

	const totalAmount = filtered.reduce((sum, t) => sum + t.amount, 0);

	// ── Loading state ──
	if (!txData) {
		return (
			<div className="bg-white min-h-screen p-4">
				<div className="flex items-center justify-between mb-6">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-9 w-32" />
				</div>
				<div className="space-y-3">
					{Array.from({ length: 8 }).map((_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			</div>
		);
	}

	// ── Empty state ──
	const isEmpty = allTransactions.length === 0;
	const noResults = allTransactions.length > 0 && filtered.length === 0;

	return (
		<div className="bg-white min-h-screen">
			<div className="p-4 md:p-4">
				{/* ── Header ── */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
					<div>
						<h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"><Receipt className="mr-2 inline h-5 w-5 text-primary" />Pengeluaran</h1>
						<p className="text-sm text-slate-500 mt-0.5">
							{filtered.length > 0
								? `${filtered.length} transaksi • Total Rp ${formatCurrencyIDR(totalAmount)}`
								: "Tidak ada data"}
						</p>
					</div>
					<button
						className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						onClick={() =>
							exportExpensesCSV(filtered.length > 0 ? filtered : allTransactions, dateRange.label)
						}
					>
						<Download className="h-4 w-4" />
						Export CSV
					</button>
				</div>

				{/* ── Filters bar ── */}
				<div className="flex flex-col sm:flex-row gap-3 mb-5">
					{/* Period buttons */}
					<div className="flex flex-wrap gap-1.5">
						{PERIOD_BUTTONS.map((btn) => (
							<button
								key={btn.value}
								className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
									period === btn.value
										? "bg-slate-900 text-white"
										: "bg-slate-100 text-slate-600 hover:bg-slate-200"
								}`}
								onClick={() => handlePeriodChange(btn.value)}
							>
								{btn.label}
							</button>
						))}
					</div>

					<div className="flex-1" />

					{/* Category filter */}
					<select
						className="rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
						onChange={(e) => setFilterCategory(e.target.value)}
						value={filterCategory}
					>
						<option value="">Semua Kategori</option>
						{categories.map((cat) => (
							<option key={cat} value={cat}>
								{categoryLabel(cat)}
							</option>
						))}
					</select>

					{/* Search */}
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
						<input
							className="w-full sm:w-56 rounded-lg border border-slate-200/80 bg-white pl-9 pr-12 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Cari deskripsi / merchant..."
							type="text"
							value={searchQuery}
						/>
						{searchQuery && (
							<button
								className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Hapus pencarian"
								onClick={() => setSearchQuery("")}
							>
								<X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
							</button>
						)}
					</div>
				</div>

				{/* ── Empty state ── */}
				{isEmpty && (
					<div className="flex flex-col items-center justify-center py-12 text-slate-400">
						<Receipt className="h-12 w-12 mb-3" />
						<p className="text-lg font-medium">Tidak ada pengeluaran</p>
						<p className="text-sm mt-1">
							Belum ada transaksi pengeluaran di periode {dateRange.label}
						</p>
					</div>
				)}

				{/* ── No results ── */}
				{noResults && (
					<div className="flex flex-col items-center justify-center py-12 text-slate-400">
						<Search className="h-12 w-12 mb-3" />
						<p className="text-lg font-medium">Tidak ditemukan</p>
						<p className="text-sm mt-1">
							Coba ubah kata kunci atau filter kategori
						</p>
					</div>
				)}

				{/* ── Table ── */}
				{filtered.length > 0 && (
					<>
						<div className="overflow-x-auto rounded-xl border border-slate-200/80">
							<table className="w-full text-sm">
								<thead>
									<tr className="bg-slate-50/70 text-left text-xs font-semibold uppercase text-slate-500">
										<th className="px-4 py-3 w-4">#</th>
										<th
											className="px-4 py-3 cursor-pointer hover:text-slate-700 select-none"
											onClick={() => handleSort("date")}
										>
											<div className="flex items-center gap-1">
												Tanggal
												<ArrowUpDown className="h-3 w-3" />
											</div>
										</th>
										<th
											className="px-4 py-3 cursor-pointer hover:text-slate-700 select-none"
											onClick={() => handleSort("category")}
										>
											<div className="flex items-center gap-1">
												Kategori
												<ArrowUpDown className="h-3 w-3" />
											</div>
										</th>
										<th className="px-4 py-3">Deskripsi</th>
										<th className="px-4 py-3">Merchant</th>
										<th
											className="px-4 py-3 text-right cursor-pointer hover:text-slate-700 select-none"
											onClick={() => handleSort("amount")}
										>
											<div className="flex items-center justify-end gap-1">
												Jumlah
												<ArrowUpDown className="h-3 w-3" />
											</div>
										</th>
										<th className="px-4 py-3">Metode</th>
										<th className="px-4 py-3">Status</th>
										<th className="px-4 py-3 text-center">Struk</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{paged.map((tx, idx) => {
										const hasReceipt = (tx as any).metadata?.receipt_image_url;
										return (
											<tr
												key={tx._id}
												className="hover:bg-slate-50/70 cursor-pointer transition-colors"
												onClick={() => setSelectedTx(tx)}
											>
												<td className="px-4 py-3 text-xs text-slate-400">
													{(safePage - 1) * PAGE_SIZE + idx + 1}
												</td>
												<td className="px-4 py-3 whitespace-nowrap font-medium text-slate-800">
													{format(new Date(tx.date), "dd MMM yyyy", { locale: localeID })}
												</td>
												<td className="px-4 py-3">
													<span
														className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColor(tx.category)}`}
													>
														{categoryLabel(tx.category)}
													</span>
												</td>
												<td className="px-4 py-3 max-w-[200px] truncate text-slate-600">
													{tx.description || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													{tx.merchant || "-"}
												</td>
												<td className="px-4 py-3 text-right font-medium text-red-600">
													Rp {formatCurrencyIDR(tx.amount)}
												</td>
												<td className="px-4 py-3 text-slate-500 text-xs capitalize">
													{tx.paymentMethod || "-"}
												</td>
												<td className="px-4 py-3">
													<span
														className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
															tx.status === "completed"
																? "bg-green-100 text-green-700"
																: tx.status === "pending"
																	? "bg-yellow-100 text-yellow-700"
																	: "bg-red-100 text-red-700"
														}`}
													>
														{tx.status === "completed"
															? "✅"
															: tx.status === "pending"
																? "⏳"
																: tx.status}
													</span>
												</td>
												<td className="px-4 py-3 text-center">
													{hasReceipt ? (
														<img
															alt="Struk"
															className="h-9 w-9 rounded object-cover border border-slate-200/80 cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all"
															onClick={(e) => { e.stopPropagation(); setSelectedTx(tx); }}
															src={(tx as any).metadata.receipt_image_url}
														/>
													) : (
														<span className="text-xs text-slate-300">—</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						{/* ── Pagination ── */}
						{totalPages > 1 && (
							<div className="flex items-center justify-between mt-4 text-sm text-slate-500">
								<span>
									{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}{" "}
									dari {filtered.length}
								</span>
								<div className="flex items-center gap-2">
									<button
										className="rounded-lg border border-slate-200/80 p-1.5 hover:bg-slate-50/70 disabled:opacity-30"
										disabled={safePage <= 1}
										onClick={() => setPage((p) => Math.max(1, p - 1))}
									>
										<ChevronLeft className="h-4 w-4" />
									</button>
									<span className="px-2 font-medium">
										{safePage} / {totalPages}
									</span>
									<button
										className="rounded-lg border border-slate-200/80 p-1.5 hover:bg-slate-50/70 disabled:opacity-30"
										disabled={safePage >= totalPages}
										onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
									>
										<ChevronRight className="h-4 w-4" />
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{/* ── Detail Modal ── */}
			{selectedTx && (
				<ExpenseDetailModal
					transaction={selectedTx}
					onClose={() => setSelectedTx(null)}
				/>
			)}
		</div>
	);
}
