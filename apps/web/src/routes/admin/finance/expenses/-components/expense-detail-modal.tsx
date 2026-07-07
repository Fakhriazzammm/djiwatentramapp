import { X, Receipt, Image, ExternalLink } from "lucide-react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import type { TransactionRow } from "@/lib/export-utils";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";
import { useState } from "react";

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

function categoryLabel(cat: string): string {
	return CATEGORY_LABELS[cat] || cat.replace(/_/g, " ");
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
	completed: { label: "Selesai", color: "bg-green-100 text-green-700" },
	pending: { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
	cancelled: { label: "Dibatalkan", color: "bg-red-100 text-red-700" },
};

interface Props {
	transaction: TransactionRow;
	onClose: () => void;
}

export function ExpenseDetailModal({ transaction: tx, onClose }: Props) {
	const [showReceipt, setShowReceipt] = useState(false);
	const receiptUrl = (tx as any).metadata?.receipt_image_url as string | undefined;

	const status = STATUS_LABELS[tx.status] || {
		label: tx.status,
		color: "bg-gray-100 text-gray-600",
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/40" onClick={onClose} />

			{/* Modal */}
			<div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
					<div className="flex items-center gap-2">
						<Receipt className="h-5 w-5 text-slate-400" />
						<h2 className="text-lg font-semibold text-slate-900">Detail Pengeluaran</h2>
					</div>
					<button
						className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
						onClick={onClose}
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Body */}
				<div className="p-5 space-y-4 overflow-y-auto">
					{/* Summary card */}
					<div className="rounded-xl bg-slate-50 p-4 space-y-3">
						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Tanggal</span>
							<span className="text-sm font-medium text-slate-800">
								{format(new Date(tx.date), "EEEE, dd MMMM yyyy", { locale: localeID })}
							</span>
						</div>

						<hr className="border-slate-200" />

						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Kategori</span>
							<span className="text-sm font-medium text-slate-800">
								{categoryLabel(tx.category)}
							</span>
						</div>

						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Deskripsi</span>
							<span className="text-sm font-medium text-slate-800 text-right max-w-[60%]">
								{tx.description || "-"}
							</span>
						</div>

						{tx.merchant && (
							<div className="flex justify-between items-start">
								<span className="text-sm text-slate-500">Merchant</span>
								<span className="text-sm font-medium text-slate-800">{tx.merchant}</span>
							</div>
						)}

						<hr className="border-slate-200" />

						<div className="flex justify-between items-center">
							<span className="text-sm text-slate-500">Jumlah</span>
							<span className="text-lg font-bold text-red-600">
								Rp {formatCurrencyIDR(tx.amount)}
							</span>
						</div>

						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Metode Bayar</span>
							<span className="text-sm font-medium text-slate-800 capitalize">
								{tx.paymentMethod || "-"}
							</span>
						</div>

						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Status</span>
							<span
								className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
							>
								{status.label}
							</span>
						</div>
					</div>

					{/* Source info */}
					{(tx as any).sourceFingerprint && (
						<div className="rounded-xl bg-slate-50 p-4">
							<div className="flex justify-between items-start">
								<span className="text-xs text-slate-400">No. Struk</span>
								<span className="text-xs font-mono text-slate-500">
									{(tx as any).metadata?.receipt_number || (tx as any).sourceFingerprint?.slice(0, 12) || "-"}
								</span>
							</div>
						</div>
					)}

					{/* Receipt Image */}
					{receiptUrl && (
						<div className="space-y-2">
							<button
								className="w-full flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
								onClick={() => setShowReceipt(!showReceipt)}
							>
								<Image className="h-4 w-4" />
								{showReceipt ? "Sembunyikan foto struk" : "Lihat foto struk"}
							</button>

							{showReceipt && (
								<div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
									<img
										alt="Foto Struk"
										className="w-full h-auto max-h-[400px] object-contain bg-white"
										src={receiptUrl}
									/>
									<div className="p-2 bg-white border-t border-slate-100">
										<a
											className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
											href={receiptUrl}
											rel="noreferrer"
											target="_blank"
										>
											<ExternalLink className="h-3 w-3" />
											Buka di tab baru
										</a>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Additional metadata (if any non-receipt metadata) */}
					{(tx as any).metadata &&
						Object.keys((tx as any).metadata).filter((k: string) => k !== "receipt_image_url" && k !== "receipt_number").length > 0 && (
							<div className="rounded-xl bg-slate-50 p-4 space-y-2">
								<p className="text-xs font-semibold text-slate-400 uppercase">Metadata</p>
								{Object.entries((tx as any).metadata)
									.filter(([k]) => k !== "receipt_image_url" && k !== "receipt_number")
									.map(([key, value]) => (
										<div key={key} className="flex justify-between items-start text-xs">
											<span className="text-slate-400">{key}</span>
											<span className="text-slate-600 max-w-[60%] text-right">
												{typeof value === "object" ? JSON.stringify(value) : String(value)}
											</span>
										</div>
									))}
							</div>
						)}
				</div>

				{/* Footer */}
				<div className="px-5 py-3 border-t border-slate-100 bg-white">
					<button
						className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
						onClick={onClose}
					>
						Tutup
					</button>
				</div>
			</div>
		</div>
	);
}
