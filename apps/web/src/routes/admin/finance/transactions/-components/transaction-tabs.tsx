import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TransactionsView } from "./transactions-view";
import {
	BarChart3,
	BookOpen,
	ChevronRight,
	FileText,
	TrendingUp,
	TrendingDown,
	Wallet,
	ArrowUpRight,
	ArrowDownRight,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";
import { useHybridTransactionDetailReport } from "@/hooks/use-hybrid-finance-analytics-data";
import { formatCurrencyIDR } from "@/lib/export-utils";

type Tab = "ringkasan" | "riwayat" | "akuntansi";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
	{ key: "ringkasan", label: "Ringkasan", icon: <BarChart3 className="h-3.5 w-3.5" /> },
	{ key: "riwayat", label: "Riwayat", icon: <FileText className="h-3.5 w-3.5" /> },
	{ key: "akuntansi", label: "Akuntansi", icon: <BookOpen className="h-3.5 w-3.5" /> },
];

export function TransactionsTabs() {
	const [activeTab, setActiveTab] = useState<Tab>("riwayat");
	const navigate = useNavigate();

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-white">
			{/* Tab bar — 3 pill tabs */}
			<div className="flex items-center gap-0.5 border-b bg-white px-4 pb-0 pt-3">
				{TABS.map((tab) => {
					const isActive = activeTab === tab.key;
					return (
						<button
							className={`flex items-center gap-1.5 rounded-t-lg px-3.5 py-2 font-medium text-xs transition-all ${
								isActive
									? "bg-blue-50 text-blue-700 shadow-sm"
									: "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
							}`}
							key={tab.key}
							onClick={() => setActiveTab(tab.key)}
							type="button"
						>
							{tab.icon}
							{tab.label}
						</button>
					);
				})}

				<div className="ml-auto flex items-center gap-2">
					<button
						className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
						onClick={() => navigate({ to: "/admin/finance/accounting" })}
						type="button"
					>
						<BookOpen className="h-3 w-3" />
						Kelola Akun
						<ChevronRight className="h-3 w-3" />
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "ringkasan" && <RingkasanTab />}
				{activeTab === "riwayat" && <RiwayatTab />}
				{activeTab === "akuntansi" && <AkuntansiTab />}
			</div>
		</div>
	);
}

function RingkasanTab() {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const endOfMonth = now.getTime();

	const txData = useHybridTransactionDetailReport({
		startDate: startOfMonth,
		endDate: endOfMonth,
		viewMode: "transaction",
		page: 1,
		pageSize: 1,
	});

	// Compare with last month
	const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
	const lastTxData = useHybridTransactionDetailReport({
		startDate: lastMonthStart,
		endDate: lastMonthEnd,
		viewMode: "transaction",
		page: 1,
		pageSize: 1,
	});

	const income = txData?.totalIncome ?? 0;
	const expense = txData?.totalExpense ?? 0;
	const net = txData?.netBalance ?? 0;
	const count = txData?.count ?? 0;

	const lastIncome = lastTxData?.totalIncome ?? 0;
	const lastExpense = lastTxData?.totalExpense ?? 0;

	const incomePct = lastIncome > 0 ? ((income - lastIncome) / lastIncome) * 100 : 0;
	const expensePct = lastExpense > 0 ? ((expense - lastExpense) / lastExpense) * 100 : 0;

	// Top categories — use expense data breakdown
	const expensesByCat = new Map<string, number>();
	for (const tx of (txData?.transactions || []) as any[]) {
		if (tx.type === "expense") {
			const cat = tx.category || "lainnya";
			expensesByCat.set(cat, (expensesByCat.get(cat) || 0) + Number(tx.amount || 0));
		}
	}
	const topCategories = [...expensesByCat.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);

	const categoryLabels: Record<string, string> = {
		bahan_makanan: "Bahan Makanan",
		bahan_minuman: "Bahan Minuman",
		operasional: "Operasional",
		gaji: "Gaji",
		sewa: "Sewa",
		listrik: "Listrik & Air",
		transportasi: "Transportasi",
		pemasaran: "Pemasaran",
		perlengkapan: "Perlengkapan",
		lainnya: "Lainnya",
	};

	return (
		<div className="space-y-3 p-4">
			{/* Period header */}
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-slate-800 text-sm">
					{format(now, "MMMM yyyy", { locale: localeID })}
				</h2>
				<span className="text-[10px] text-slate-400">{count} transaksi</span>
			</div>

			{/* 3 Card row */}
			<div className="grid grid-cols-3 gap-3">
				<div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
						<TrendingUp className="h-3 w-3" />
						Pemasukan
					</div>
					<p className="mt-1 font-bold text-emerald-800 text-sm">
						{formatCurrencyIDR(income)}
					</p>
					<div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-emerald-600">
						<ArrowUpRight className="h-2.5 w-2.5" />
						{incomePct.toFixed(1)}%
					</div>
				</div>

				<div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium text-red-700">
						<TrendingDown className="h-3 w-3" />
						Pengeluaran
					</div>
					<p className="mt-1 font-bold text-red-800 text-sm">
						{formatCurrencyIDR(expense)}
					</p>
					<div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-red-600">
						<ArrowDownRight className="h-2.5 w-2.5" />
						{expensePct.toFixed(1)}%
					</div>
				</div>

				<div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium text-blue-700">
						<Wallet className="h-3 w-3" />
						Saldo Bersih
					</div>
					<p className={`mt-1 font-bold text-sm ${net >= 0 ? "text-blue-800" : "text-red-800"}`}>
						{formatCurrencyIDR(net)}
					</p>
				</div>
			</div>

			{/* Visual bar: income vs expense */}
			{income + expense > 0 && (
				<div className="rounded-xl border border-slate-100 bg-white p-3">
					<div className="flex items-center justify-between text-[10px] text-slate-500">
						<span>Pemasaran vs Pengeluaran</span>
						<span className="font-mono">
							{((income / (income + expense)) * 100).toFixed(0)}% :{" "}
							{((expense / (income + expense)) * 100).toFixed(0)}%
						</span>
					</div>
					<div className="mt-2 flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
						<div
							className="bg-emerald-400 transition-all"
							style={{
								width: `${(income / (income + expense)) * 100}%`,
							}}
						/>
						<div
							className="bg-red-400 transition-all"
							style={{
								width: `${(expense / (income + expense)) * 100}%`,
							}}
						/>
					</div>
				</div>
			)}

			{/* Top 5 kategori pengeluaran */}
			{topCategories.length > 0 && (
				<div className="rounded-xl border border-slate-100 bg-white p-3">
					<h3 className="mb-2 font-medium text-slate-700 text-[11px]">
						Top Pengeluaran
					</h3>
					<div className="space-y-1.5">
						{topCategories.map(([cat, amt]) => {
							const pct = expense > 0 ? (amt / expense) * 100 : 0;
							return (
								<div key={cat}>
									<div className="flex items-center justify-between text-[10px]">
										<span className="text-slate-700">
											{categoryLabels[cat] || cat}
										</span>
										<span className="font-mono text-slate-600">
											{formatCurrencyIDR(amt)}
										</span>
									</div>
									<div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
										<div
											className="h-full rounded-full bg-orange-400"
											style={{ width: `${pct}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Quick links */}
			<div className="flex gap-2">
				<button
					className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
					onClick={() => window.history.pushState({}, "", "/admin/finance/transactions?tab=riwayat")}
					type="button"
				>
					<FileText className="h-3 w-3" />
					Lihat Riwayat
				</button>
			</div>
		</div>
	);
}

function RiwayatTab() {
	return <TransactionsView />;
}

function AkuntansiTab() {
	const navigate = useNavigate();

	// Simple quick navigation card
	return (
		<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
			<BookOpen className="h-10 w-10 text-slate-300" />
			<h3 className="font-medium text-slate-700 text-sm">Chart of Accounts</h3>
			<p className="max-w-xs text-[11px] text-slate-500">
				Lihat dan kelola akun akuntansi, serta cek keseimbangan debit & kredit.
			</p>
			<div className="flex gap-2">
				<button
					className="rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-medium text-white hover:bg-blue-700"
					onClick={() => navigate({ to: "/admin/finance/accounting" })}
					type="button"
				>
					Buka COA Manager
				</button>
			</div>
		</div>
	);
}
