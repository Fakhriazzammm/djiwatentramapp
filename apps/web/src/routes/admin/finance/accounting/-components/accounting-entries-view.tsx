import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridAccountingReport } from "@/hooks/use-hybrid-finance-analytics-data";
import { formatCurrencyIDR } from "@/lib/export-utils";
import {
	getRangeFromPeriod,
	type PeriodOption,
} from "../../reports/-components/period-selector";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PERIOD_BUTTONS: { value: PeriodOption; label: string }[] = [
	{ value: "today", label: "Hari Ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "this_week", label: "Minggu Ini" },
	{ value: "this_month", label: "Bulan Ini" },
	{ value: "last_month", label: "Bulan Lalu" },
];

export function AccountingEntriesView() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const range = useMemo(() => getRangeFromPeriod(period), [period]);

	const accData = useHybridAccountingReport({
		startDate: range.startDate,
		endDate: range.endDate,
	});

	const summary = accData.summary;

	return (
		<div className="p-3 space-y-3">
			{/* Period filter */}
			<div className="flex items-center gap-1 flex-wrap">
				{PERIOD_BUTTONS.map((item) => (
					<button
						className={`rounded-sm border px-2 py-1 text-[10px] font-medium transition-colors ${
							period === item.value
								? "border-amber-500 bg-amber-50 text-amber-700"
								: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
						}`}
						key={item.value}
						onClick={() => setPeriod(item.value)}
						type="button"
					>
						{item.label}
					</button>
				))}
			</div>

			{/* Summary cards */}
			{!accData.loading && (
				<div className="grid grid-cols-3 gap-3">
					<div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
						<div className="text-[10px] font-medium text-sky-700">Total Debit</div>
						<div className="mt-1 font-bold text-sky-800 text-sm">
							{formatCurrencyIDR(summary.totalDebit)}
						</div>
					</div>
					<div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
						<div className="text-[10px] font-medium text-violet-700">Total Kredit</div>
						<div className="mt-1 font-bold text-violet-800 text-sm">
							{formatCurrencyIDR(summary.totalKredit)}
						</div>
					</div>
					<div className={`rounded-xl border p-3 ${
						summary.balance
							? "border-emerald-100 bg-emerald-50/60"
							: "border-red-100 bg-red-50/60"
					}`}>
						<div className="text-[10px] font-medium text-slate-600">Selisih</div>
						<div className={`mt-1 font-bold text-sm ${
							summary.balance ? "text-emerald-800" : "text-red-800"
						}`}>
							{summary.balance ? "✅ SEIMBANG" : `⚠️ Rp${summary.selisih.toLocaleString("id-ID")}`}
						</div>
						<div className="mt-0.5 text-[9px] text-slate-400">
							{summary.count} entry
						</div>
					</div>
				</div>
			)}

			{/* Entries Table */}
			<div className="overflow-x-auto rounded-xl border border-slate-200">
				<table className="w-full">
					<colgroup>
						<col style={{ width: "32px" }} />
						<col style={{ width: "80px" }} />
						<col style={{ width: "100px" }} />
						<col style={{ width: "80px" }} />
						<col />
						<col style={{ width: "100px" }} />
						<col style={{ width: "100px" }} />
					</colgroup>
					<thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
						<tr>
							<th className="border-b border-slate-200 px-1 py-1.5 text-center">No</th>
							<th className="border-b border-slate-200 px-2 py-1.5">Tgl</th>
							<th className="border-b border-slate-200 px-2 py-1.5">ID</th>
							<th className="border-b border-slate-200 px-2 py-1.5">Sumber</th>
							<th className="border-b border-slate-200 px-2 py-1.5">Akun / COA</th>
							<th className="border-b border-slate-200 bg-sky-50 px-2 py-1.5 text-right text-sky-700">Debit</th>
							<th className="border-b border-slate-200 bg-violet-50 px-2 py-1.5 text-right text-violet-700">Kredit</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{accData.loading ? (
							Array.from({ length: 8 }).map((_, i) => (
								<tr key={i}>
									<td colSpan={7} className="px-2 py-1.5"><Skeleton className="h-3 w-full" /></td>
								</tr>
							))
						) : accData.entries.length === 0 ? (
							<tr>
								<td colSpan={7} className="px-2 py-8 text-center text-[10px] text-slate-400">
									Belum ada entry akuntansi untuk periode ini.
								</td>
							</tr>
						) : (
							accData.entries.map((e: any, i: number) => {
								const isDebit = e.entry_type === "debit";
								return (
									<tr
										className={`group transition-colors hover:bg-slate-50 ${isDebit ? "" : ""}`}
										key={e.id || i}
									>
										<td className="px-1 py-1 text-center font-mono text-[9px] text-slate-400">{i + 1}</td>
										<td className="whitespace-nowrap px-2 py-1">
											<span className="text-[9px] text-slate-500">
												{e.created_at
													? new Date(e.created_at).toLocaleDateString("id-ID", {
															day: "2-digit",
															month: "short",
													  })
													: "-"}
											</span>
										</td>
										<td className="whitespace-nowrap px-2 py-1">
											<span className="font-mono text-[8px] text-slate-400">
												{String(e.transaction_source_id).slice(-10)}
											</span>
										</td>
										<td className="whitespace-nowrap px-2 py-1">
											<span className="rounded bg-slate-100 px-1 py-0.5 text-[8px] font-medium text-slate-600">
												{e.source_label || "—"}
											</span>
										</td>
										<td className="px-2 py-1">
											<div className="flex items-center gap-1.5">
												<code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[8px] text-slate-500">
													{e.coa_code || ""}
												</code>
												<span className="truncate text-[10px] text-slate-700">
													{e.coa_name || ""}
												</span>
											</div>
										</td>
										<td className="px-2 py-1 text-right font-mono text-[10px] text-sky-700">
											{isDebit ? formatCurrencyIDR(e.amount) : ""}
										</td>
										<td className="px-2 py-1 text-right font-mono text-[10px] text-violet-700">
											{!isDebit ? formatCurrencyIDR(e.amount) : ""}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
