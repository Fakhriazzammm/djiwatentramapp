import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { Wallet, Pencil, Trash2, Search, Filter, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
	
	const deleteTransaction = useMutation(api.finance.deleteTransaction);

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
				t.category.toLowerCase().includes(query)
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
			toast.success("Transaksi berhasil dihapus");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus transaksi");
		}
	};

	const handleEdit = (transaction: any) => {
		setSelectedTransaction(transaction);
		setIsEditDialogOpen(true);
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

			{/* Transactions Table */}
			<div className="rounded-xl border border-border overflow-hidden">
				<table className="w-full text-left text-sm border-collapse">
					<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider font-bold">
						<tr>
							<th className="px-4 py-3">Tanggal</th>
							<th className="px-4 py-3">Shift</th>
							<th className="px-4 py-3">Merchant/Keterangan</th>
							<th className="px-4 py-3">Kategori</th>
							<th className="px-4 py-3">Metode</th>
							<th className="px-4 py-3 text-right">Nominal</th>
							<th className="px-4 py-3 text-right">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border bg-card">
						{!data ? (
							Array.from({ length: 5 }).map((_, i) => (
								<tr key={i}>
									<td colSpan={7} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>
								</tr>
							))
						) : filteredTransactions.length === 0 ? (
							<tr>
								<td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
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

								return (
									<tr key={t._id} className="group hover:bg-muted/30 transition-colors">
										<td className="px-4 py-4 whitespace-nowrap">
											<div className="flex flex-col">
												<span className="font-medium text-foreground">
													{format(new Date(t.date), "dd MMM yyyy", { locale: localeID })}
												</span>
												<span className="text-[10px] text-muted-foreground">
													{format(new Date(t.date), "HH:mm")}
												</span>
											</div>
										</td>
										<td className="px-4 py-4">
											{shiftName !== "-" ? (
												<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary uppercase">
													{shiftName}
												</span>
											) : (
												<span className="text-muted-foreground text-xs">-</span>
											)}
										</td>
										<td className="px-4 py-4">
											<div className="flex flex-col max-w-[200px]">
											<span className="font-semibold text-foreground truncate">
												{t.merchant || "Umum"}
											</span>
											<span className="text-[11px] text-muted-foreground truncate">
												{t.description || "-"}
											</span>
										</div>
									</td>
									<td className="px-4 py-4">
										{categoryBadge(t.category, t.type)}
									</td>
									<td className="px-4 py-4 whitespace-nowrap">
										<span className="text-[11px] text-muted-foreground font-medium uppercase">
											{t.paymentMethod || "Cash"}
										</span>
									</td>
									<td className="px-4 py-4 text-right whitespace-nowrap">
										<span className={`font-bold ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
											{t.type === "income" ? "+" : "-"} {formatCurrencyIDR(t.amount)}
										</span>
									</td>
									<td className="px-4 py-4 text-right whitespace-nowrap">
											<div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
												<button
													onClick={() => handleEdit(t)}
													className="p-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
													title="Ubah"
												>
													<Pencil className="h-4 w-4" />
												</button>
												<button
													onClick={() => handleDelete(t._id)}
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
