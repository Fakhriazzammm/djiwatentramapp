import React from "react";
import { Receipt, FileText, TrendingDown, TrendingUp } from "lucide-react";
import type { ScanResultData } from "./types";
import { toRupiah } from "./utils";

export function ScanResultCard({ data }: { data: ScanResultData }) {
	const typeLabel: Record<string, string> = {
		receipt: "Struk Belanja",
		invoice: "Invoice/Faktur",
		note: "Nota",
		handwriting: "Tulisan Tangan",
		product: "Produk",
		other: "Dokumen",
		unknown: "Tidak Dikenali",
	};

	const paymentLabel: Record<string, string> = {
		cash: "Tunai",
		qris: "QRIS",
		card: "Kartu",
		transfer: "Transfer",
		unknown: "-",
	};

	const confidenceColor =
		data.confidence >= 80
			? "text-green-600 bg-green-500/10"
			: data.confidence >= 50
				? "text-yellow-600 bg-yellow-500/10"
				: "text-red-600 bg-red-500/10";

	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-border bg-background shadow-sm max-w-full">
			{/* Header */}
			<div className="flex items-center justify-between border-border border-b bg-muted/40 px-3 py-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
					<span className="font-semibold text-foreground text-xs truncate">
						{typeLabel[data.type] ?? "Dokumen"}
					</span>
					{data.name && data.name !== "Tidak dapat diidentifikasi" && (
						<span className="text-muted-foreground text-[10px] truncate"> {data.name}</span>
					)}
				</div>
				<span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-tighter shrink-0 ${confidenceColor}`}>
					{data.confidence}% Akurat
				</span>
			</div>

			{/* Main Data */}
			<div className="p-3 space-y-2.5">
				{/* Transaction Type + Total */}
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 shrink-0">
						{data.transactionType === "expense" ? (
							<>
								<TrendingDown className="h-4 w-4 text-red-500" />
								<span className="font-medium text-red-600 text-xs">Pengeluaran</span>
							</>
						) : data.transactionType === "income" ? (
							<>
								<TrendingUp className="h-4 w-4 text-green-500" />
								<span className="font-medium text-green-600 text-xs">Pemasukan</span>
							</>
						) : (
							<>
								<FileText className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground text-xs text-[10px]">Tipe tidak mengenali</span>
							</>
						)}
					</div>
					{data.total > 0 && (
						<span className="font-bold text-foreground text-sm whitespace-nowrap">
							Rp{toRupiah(data.total)}
						</span>
					)}
				</div>

				{/* Meta info grid */}
				<div className="grid grid-cols-2 gap-1.5 text-[10px]">
					{data.category && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Kategori</span>
							<span className="font-medium text-foreground capitalize truncate">{data.category.replace(/_/g, " ")}</span>
						</div>
					)}
					{data.paymentMethod && data.paymentMethod !== "unknown" && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Metode</span>
							<span className="font-medium text-foreground capitalize">{paymentLabel[data.paymentMethod] ?? data.paymentMethod}</span>
						</div>
					)}
					{data.date && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Tanggal</span>
							<span className="font-medium text-foreground">{data.date}</span>
						</div>
					)}
					{(data.tax ?? 0) > 0 && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Pajak</span>
							<span className="font-medium text-foreground">Rp{toRupiah(data.tax)}</span>
						</div>
					)}
					{(data.discount ?? 0) > 0 && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Diskon</span>
							<span className="font-medium text-green-600">-Rp{toRupiah(data.discount)}</span>
						</div>
					)}
					{(data.subtotal ?? 0) > 0 && data.subtotal !== data.total && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground leading-none mb-1">Subtotal</span>
							<span className="font-medium text-foreground">Rp{toRupiah(data.subtotal)}</span>
						</div>
					)}
				</div>

				{/* Items list */}
				{data.items && data.items.length > 0 && (
					<div className="rounded-lg border border-border overflow-hidden">
						<div className="bg-muted/40 px-2.5 py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
							Detail Item ({data.items.length})
						</div>
						<div className="divide-y divide-border max-h-[150px] overflow-y-auto">
							{data.items.map((item, idx) => (
								<div className="flex items-center justify-between px-2.5 py-1.5 gap-2" key={idx}>
									<div className="flex-1 min-w-0">
										<p className="text-[10px] text-foreground font-medium truncate leading-tight">{item.name}</p>
										{item.qty > 0 && (
											<p className="text-[9px] text-muted-foreground">{item.qty} {item.unit || "pcs"}</p>
										)}
									</div>
									<span className="text-[10px] font-semibold text-foreground whitespace-nowrap">
										Rp{toRupiah(item.subtotal || (item.price * item.qty) || item.price)}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Notes */}
				{data.notes && data.notes !== "Gambar berhasil dianalisis namun data tidak dapat diekstrak secara terstruktur." && (
					<div className="bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
						<p className="text-[10px] text-amber-900 italic leading-relaxed">
							{data.notes}
						</p>
					</div>
				)}

				{data.rewrittenText && data.rewrittenText.trim().length > 0 && (
					<div className="rounded-lg border border-primary/20 bg-primary/5 p-2">
						<p className="mb-1 text-[10px] font-semibold text-primary">
							Tulisan Ulang AI
						</p>
						<p className="whitespace-pre-wrap text-[10px] leading-relaxed text-foreground/90">
							{data.rewrittenText}
						</p>
					</div>
				)}

				{data.rawText && data.rawText.trim().length > 0 && (
					<div className="rounded-lg border border-border bg-muted/30 p-2">
						<p className="mb-1 text-[10px] font-semibold text-muted-foreground">
							Teks OCR Mentah
						</p>
						<p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-muted-foreground">
							{data.rawText}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
