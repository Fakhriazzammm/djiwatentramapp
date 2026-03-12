import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Wallet, Pencil, Trash2 } from "lucide-react";
import type { DateRange } from "./period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import { toast } from "sonner";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";

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
	
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
	
	const deleteTransaction = useMutation(api.finance.deleteTransaction);

	const data = useQuery(api.finance.getTransactionDetailReport, {
		startDate: range.startDate,
		endDate: range.endDate,
		type: filterType,
		category: filterCategory || undefined,
	});

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
		<div className="space-y-4">
			{/* Filters */}
			<div className="flex flex-wrap gap-2 items-center">
				<div className="flex gap-1">
					{(["all", "income", "expense"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setFilterType(t === "all" ? undefined : t)}
							className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
								(t === "all" && !filterType) || filterType === t
									? t === "income"
										? "bg-green-600 text-white"
										: t === "expense"
											? "bg-red-600 text-white"
											: "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:bg-muted/70"
							}`}
						>
							{t === "all" ? "Semua" : t === "income" ? "Pemasukan" : "Pengeluaran"}
						</button>
					))}
				</div>
				<select
					value={filterCategory}
					onChange={(e) => setFilterCategory(e.target.value)}
					className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
				>
					<option value="">Semua Kategori</option>
					<option value="Penjualan">Penjualan</option>
					{EXPENSE_CATEGORIES.map((cat) => (
						<option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
					))}
				</select>
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

			{/* Table */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				{!data ? (
					<div className="flex items-center justify-center py-20 text-muted-foreground">Memuat data...</div>
				) : data.transactions.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
						<Wallet className="h-10 w-10 mb-3 opacity-30" />
						<p>Tidak ada transaksi pada filter ini</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
								<tr>
									<th className="px-4 py-3 text-left">Tanggal</th>
									<th className="px-4 py-3 text-left">Jenis</th>
									<th className="px-4 py-3 text-left">Kategori</th>
									<th className="px-4 py-3 text-left">Merchant</th>
									<th className="px-4 py-3 text-left">Keterangan</th>
									<th className="px-4 py-3 text-left">Metode</th>
									<th className="px-4 py-3 text-left">Status</th>
									<th className="px-4 py-3 text-right">Jumlah</th>
									<th className="px-4 py-3 text-center">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{(data.transactions as Array<{ _id: Id<"financialTransactions">; type: "income" | "expense"; amount: number; category: string; merchant?: string; description?: string; date: number; paymentMethod?: string; status: string }>).map((t) => (
									<tr key={t._id} className="border-b border-border/40 hover:bg-muted/20">
										<td className="px-4 py-3 font-medium whitespace-nowrap">
											{new Date(t.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
										</td>
										<td className="px-4 py-3">
											<span className={`text-xs font-medium ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
												{t.type === "income" ? "↓ Masuk" : "↑ Keluar"}
											</span>
										</td>
										<td className="px-4 py-3">
											{categoryBadge(t.category, t.type)}
										</td>
										<td className="px-4 py-3 text-muted-foreground italic">{t.merchant || "-"}</td>
										<td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{t.description || "-"}</td>
										<td className="px-4 py-3 font-mono text-xs">{t.paymentMethod || "Cash"}</td>
										<td className="px-4 py-3">
											<span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
												t.status === "completed"
													? "bg-green-100 text-green-700 dark:bg-green-950/30"
													: t.status === "pending"
														? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30"
														: "bg-gray-100 text-gray-600"
											}`}>
												{t.status}
											</span>
										</td>
										<td className={`px-4 py-3 text-right font-bold ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
											{t.type === "income" ? "+" : "-"}{formatCurrencyIDR(t.amount)}
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center justify-center gap-2">
												<button
													type="button"
													onClick={() => handleEdit(t)}
													className="p-1.5 text-muted-foreground hover:bg-muted hover:text-primary rounded-md transition-colors"
													title="Edit"
												>
													<Pencil className="h-4 w-4" />
												</button>
												<button
													type="button"
													onClick={() => handleDelete(t._id)}
													className="p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive rounded-md transition-colors"
													title="Hapus"
												>
													<Trash2 className="h-4 w-4" />
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
			
			<NewTransactionDialog 
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setSelectedTransaction(null);
				}}
				initialData={selectedTransaction}
			/>
		</div>
	);
}
