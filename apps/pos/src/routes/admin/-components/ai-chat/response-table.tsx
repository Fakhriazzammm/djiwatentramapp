import React from "react";
import {
	Receipt,
	TrendingDown,
	TrendingUp,
	Calendar,
	Tag,
	CreditCard,
	Hash,
} from "lucide-react";
import type { ResponseTableData } from "./types";

const paymentLabel: Record<string, string> = {
	cash: "Tunai",
	qris: "QRIS",
	card: "Kartu",
	transfer: "Transfer",
	unknown: "-",
};

export function ResponseTable({ table }: { table: ResponseTableData }) {
	const { meta } = table;

	const confidenceColor =
		(meta?.confidence ?? 0) >= 80
			? "text-green-600 bg-green-500/10"
			: (meta?.confidence ?? 0) >= 50
				? "text-yellow-600 bg-yellow-500/10"
				: "text-red-600 bg-red-500/10";

	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-border bg-background shadow-sm max-w-full">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
					<span className="font-semibold text-foreground text-xs truncate">
						{table.title || "Data Terstruktur"}
					</span>
				</div>
				{meta && (
					<div className="flex items-center gap-1.5 shrink-0">
						{meta.transactionType === "expense" ? (
							<span className="flex items-center gap-1 text-[10px] font-medium text-red-600">
								<TrendingDown className="h-3 w-3" /> Pengeluaran
							</span>
						) : meta.transactionType === "income" ? (
							<span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
								<TrendingUp className="h-3 w-3" /> Pemasukan
							</span>
						) : null}
						{meta.confidence != null && (
							<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-tighter ${confidenceColor}`}>
								{meta.confidence}%
							</span>
						)}
					</div>
				)}
			</div>

			{/* Meta info strip */}
			{meta && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
					{meta.merchant && (
						<span className="flex items-center gap-1 font-medium text-foreground">
							{meta.merchant}
						</span>
					)}
					{meta.date && (
						<span className="flex items-center gap-0.5">
							<Calendar className="h-3 w-3" /> {meta.date}
						</span>
					)}
					{meta.category && (
						<span className="flex items-center gap-0.5">
							<Tag className="h-3 w-3" /> {meta.category}
						</span>
					)}
					{meta.paymentMethod && meta.paymentMethod !== "unknown" && (
						<span className="flex items-center gap-0.5">
							<CreditCard className="h-3 w-3" /> {paymentLabel[meta.paymentMethod] ?? meta.paymentMethod}
						</span>
					)}
					{meta.receiptNumber && (
						<span className="flex items-center gap-0.5">
							<Hash className="h-3 w-3" /> {meta.receiptNumber}
						</span>
					)}
				</div>
			)}

			{/* Table */}
			<div className="overflow-x-auto">
				<table className="w-full text-left text-[11px]">
					<thead>
						<tr className="border-b border-border bg-muted/30">
							{table.headers.map((h, i) => (
								<th key={i} className="px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{table.rows.map((row, ri) => (
							<tr key={ri} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
								{row.map((cell, ci) => {
									const isNumeric = /^[\d.,\s Rp%+-]+$/.test(cell) && cell.trim().length > 0;
									return (
										<td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${isNumeric ? "text-right font-medium tabular-nums" : ""} ${ci === 0 ? "font-medium text-foreground" : "text-foreground/80"}`}>
											{cell}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
					{table.footer && table.footer.length > 0 && (
						<tfoot>
							<tr className="border-t-2 border-border bg-muted/30 font-bold">
								{table.footer.map((cell, ci) => {
									const isNumeric = /^[\d.,\s Rp%+-]+$/.test(cell) && cell.trim().length > 0;
									return (
										<td key={ci} className={`px-3 py-2 whitespace-nowrap ${isNumeric ? "text-right tabular-nums" : ""} text-foreground`}>
											{cell}
										</td>
									);
								})}
							</tr>
						</tfoot>
					)}
				</table>
			</div>

			{/* Extra charges strip */}
			{meta && (
				((meta.tax && meta.tax !== "Rp 0") ||
				(meta.serviceCharge && meta.serviceCharge !== "Rp 0") ||
				(meta.discount && meta.discount !== "Rp 0") ||
				(meta.subtotal && meta.subtotal !== "Rp 0")) && (
					<div className="flex flex-wrap items-center gap-x-3 border-t border-border/40 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
						{meta.subtotal && meta.subtotal !== "Rp 0" && <span>Subtotal: <span className="font-medium text-foreground">{meta.subtotal}</span></span>}
						{meta.tax && meta.tax !== "Rp 0" && <span>Pajak: <span className="font-medium text-foreground">{meta.tax}</span></span>}
						{meta.serviceCharge && meta.serviceCharge !== "Rp 0" && <span>Service: <span className="font-medium text-foreground">{meta.serviceCharge}</span></span>}
						{meta.discount && meta.discount !== "Rp 0" && <span>Diskon: <span className="font-medium text-green-600">{meta.discount}</span></span>}
					</div>
				)
			)}
		</div>
	);
}
