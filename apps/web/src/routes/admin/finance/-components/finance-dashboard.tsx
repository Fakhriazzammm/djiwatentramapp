import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
	ArrowDownLeft,
	ArrowUpRight,
	Calculator,
	FileBarChart,
	Plus,
	TrendingUp,
	Wallet,
	Pencil,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { FinancialTargetPanel } from "./financial-target-panel";
import { ExpenseCategoryPieChart, PeriodComparisonCards, TrendChart } from "./finance-charts";

export function FinanceDashboard() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [filterType, setFilterType] = useState<
		"income" | "expense" | undefined
	>(undefined);

	// Get ALL transactions without pagination
	const transactions = useQuery(api.finance.getAllTransactions, {
		type: filterType,
	});

	const deleteTransaction = useMutation(api.finance.deleteTransaction);
	const updateTransaction = useMutation(api.finance.updateTransaction);

	const summary = useQuery(api.finance.getFinancialSummary, {
		startDate: undefined,
		endDate: undefined,
	});

	const hppCogs = useQuery(api.hpp.getOrdersCogs);

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(amount);
	};

	const handleDeleteTransaction = async (id: any) => {
		if (!confirm("Hapus transaksi ini?")) return;
		try {
			await deleteTransaction({ id });
			toast.success("Transaksi dihapus");
		} catch {
			toast.error("Gagal menghapus transaksi");
		}
	};

	const renderTransactionContent = () => {
		if (!transactions) {
			return (
				<div className="divide-y divide-border">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center justify-between p-4">
							<div className="flex items-center gap-4 flex-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-48" />
							</div>
							<div className="flex items-center gap-4">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-8 w-16" />
							</div>
						</div>
					))}
				</div>
			);
		}

		if (transactions.length === 0) {
			return (
				<div className="p-12 text-center">
					<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<Wallet className="h-6 w-6 text-muted-foreground" />
					</div>
					<p className="font-medium text-muted-foreground">
						Belum ada transaksi
					</p>
				</div>
			);
		}

		return (
			<div className="relative overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
						<tr>
							<th className="px-6 py-3">Tanggal</th>
							<th className="px-6 py-3">Kategori</th>
							<th className="px-6 py-3">Merchant/Toko</th>
							<th className="px-6 py-3">Keterangan</th>
							<th className="px-6 py-3">Metode</th>
							<th className="px-6 py-3 text-right">Jumlah</th>
							<th className="px-6 py-3 text-center">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{transactions.map((t: Doc<"financialTransactions">) => (
							<tr
								className="group border-border border-b transition-colors hover:bg-muted/30"
								key={t._id}
							>
									<td className="px-6 py-4 font-medium">
										{new Date(t.date).toLocaleDateString("id-ID", {
											day: "numeric",
											month: "short",
											year: "numeric",
										})}
									</td>
									<td className="px-6 py-4">
										<span className={`inline-flex items-center rounded-md border px-2 py-1 font-medium text-[10px] uppercase tracking-wider ${
											t.category === "makanan_minuman" ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/30 dark:bg-orange-900/20 dark:text-orange-400" :
											t.category === "belanja_stok" ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400" :
											t.category === "peralatan_kantor" ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400" :
											t.category === "utilitas_listrik_air" ? "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/30 dark:bg-yellow-900/20 dark:text-yellow-400" :
											t.category === "transportasi" ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/30 dark:bg-cyan-900/20 dark:text-cyan-400" :
											"border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400"
										}`}>
											{t.category.replace(/_/g, " ")}
										</span>
									</td>
									<td className="px-6 py-4 font-semibold text-foreground italic">
										{t.merchant || "Umum"}
									</td>
									<td className="px-6 py-4 text-muted-foreground">
										{t.description || "-"}
									</td>
									<td className="px-6 py-4 text-xs font-mono">
										{t.paymentMethod || "CASH"}
									</td>
									<td
										className={`px-6 py-4 text-right font-bold ${
											t.type === "income" ? "text-green-600" : "text-red-600"
										}`}
									>
										{t.type === "income" ? "+ " : "- "}
										{formatCurrency(t.amount)}
									</td>
									<td className="px-6 py-4 text-center">
										<div className="flex items-center justify-center gap-1">
											<button
												className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
												onClick={() => handleDeleteTransaction(t._id)}
												title="Hapus"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									</td>
								</tr>
							))}

						{transactions && transactions.length === 0 && (
							<tr>
								<td className="p-12 text-center" colSpan={6}>
									<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
										<Wallet className="h-6 w-6 text-muted-foreground" />
									</div>
									<p className="font-medium text-muted-foreground">
										Belum ada transaksi
									</p>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		);
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="font-bold text-2xl tracking-tight">Keuangan</h2>
					<p className="text-muted-foreground">
						Monitor arus kas dan laporan keuangan
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						to="/admin/finance/reports"
						className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 font-medium text-sm text-foreground transition-all hover:bg-muted/70"
					>
						<FileBarChart className="h-4 w-4" /> Laporan
					</Link>
					<button
						className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground transition-all hover:brightness-110"
						onClick={() => setIsDialogOpen(true)}
						type="button"
					>
						<Plus className="h-4 w-4" /> Catat Transaksi
					</button>
				</div>
			</div>

			{/* Financial Target Panel */}
			<FinancialTargetPanel />

			{/* Period Comparison */}
			<div>
				<h3 className="mb-3 font-bold text-base">Perbandingan Periode</h3>
				<PeriodComparisonCards />
			</div>

			{/* Charts Row */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<TrendChart />
				<ExpenseCategoryPieChart />
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="rounded-xl border border-border bg-card p-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-sm">
								Total Pemasukan
							</p>
							<div className="mt-1">
								{summary ? (
									<h3 className="font-bold text-2xl text-primary">
										{formatCurrency(summary.totalIncome)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-full bg-green-100 p-3 text-green-600 dark:bg-green-900/30">
							<ArrowDownLeft className="h-6 w-6" />
						</div>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-sm">
								Total Pengeluaran
							</p>
							<div className="mt-1">
								{summary ? (
									<h3 className="font-bold text-2xl text-red-600">
										{formatCurrency(summary.totalExpense)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-900/30">
							<ArrowUpRight className="h-6 w-6" />
						</div>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-sm">
								Saldo Bersih
							</p>
							<div className="mt-1">
								{summary ? (
									<h3
										className={`font-bold text-2xl ${
											(summary?.netBalance || 0) >= 0
												? "text-primary"
												: "text-destructive"
										}`}
									>
										{formatCurrency(summary.netBalance)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30">
							<Wallet className="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			{/* COGS / HPP Analysis */}
			{hppCogs && hppCogs.matchedOrders > 0 && (
				<div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-6">
					<h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
						<Calculator className="h-5 w-5 text-primary" />
						Analisis Laba Kotor (HPP)
					</h3>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
						<div>
							<p className="text-muted-foreground text-xs">Revenue Penjualan</p>
							<p className="font-bold text-lg">
								{formatCurrency(hppCogs.totalRevenue)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Total COGS</p>
							<p className="font-bold text-lg text-orange-600">
								{formatCurrency(hppCogs.totalCogs)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Laba Kotor</p>
							<p
								className={`font-bold text-lg ${hppCogs.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
							>
								{formatCurrency(hppCogs.totalProfit)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Gross Margin</p>
							<p className="flex items-center gap-1 font-bold text-lg text-primary">
								<TrendingUp className="h-4 w-4" />
								{hppCogs.grossMargin.toFixed(1)}%
							</p>
							<p className="text-[10px] text-muted-foreground">
								{hppCogs.matchedOrders} dari {hppCogs.totalCompletedOrders}{" "}
								pesanan
							</p>
						</div>
					</div>
					{/* Daily Breakdown */}
					{hppCogs.dailySummary.length > 0 && (
						<div className="mt-4 border-border/50 border-t pt-4">
							<h4 className="mb-2 font-semibold text-muted-foreground text-sm">
								Ringkasan Harian
							</h4>
							<div className="space-y-1.5">
								{hppCogs.dailySummary.slice(0, 7).map((day: any) => (
									<div
										className="flex items-center justify-between rounded border border-border/30 px-3 py-1.5 text-xs"
										key={day.date}
									>
										<span className="font-medium">
											{new Date(day.date).toLocaleDateString("id-ID", {
												weekday: "short",
												day: "numeric",
												month: "short",
											})}
										</span>
										<div className="flex items-center gap-4">
											<span className="text-muted-foreground">
												{day.orders} pesanan
											</span>
											<span>Rev: {formatCurrency(day.revenue)}</span>
											<span className="text-orange-600">
												COGS: {formatCurrency(day.cogs)}
											</span>
											<span
												className={`font-bold ${day.profit >= 0 ? "text-green-600" : "text-red-600"}`}
											>
												Laba: {formatCurrency(day.profit)}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Transaction List */}
			<div className="rounded-xl border border-border bg-card">
				<div className="flex items-center justify-between border-border/50 border-b p-6">
					<h3 className="font-bold text-lg">Riwayat Transaksi</h3>
					<div className="flex gap-2">
						<button
							className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
								filterType === undefined
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:bg-muted/50"
							}`}
							onClick={() => setFilterType(undefined)}
							type="button"
						>
							Semua
						</button>
						<button
							className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
								filterType === "income"
									? "bg-green-100 text-green-700 dark:bg-green-900/30"
									: "text-muted-foreground hover:bg-muted/50"
							}`}
							onClick={() => setFilterType("income")}
							type="button"
						>
							Pemasukan
						</button>
						<button
							className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
								filterType === "expense"
									? "bg-red-100 text-red-700 dark:bg-red-900/30"
									: "text-muted-foreground hover:bg-muted/50"
							}`}
							onClick={() => setFilterType("expense")}
							type="button"
						>
							Pengeluaran
						</button>
					</div>
				</div>

				<div className="p-0">{renderTransactionContent()}</div>
			</div>

			<NewTransactionDialog
				isOpen={isDialogOpen}
				onClose={() => setIsDialogOpen(false)}
			/>
		</div>
	);
}
