import { X, Receipt, Image, ExternalLink } from "lucide-react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import type { TransactionRow } from "@/lib/export-utils";
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";

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
	const [projection, setProjection] = useState<{ document: any | null; links: any[] }>({ document: null, links: [] });
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [inventoryOptions, setInventoryOptions] = useState<any[]>([]);
	const receiptUrl = (tx as any).metadata?.receipt_image_url as string | undefined;
	const transactionId = String((tx as any)._id || (tx as any).id || "");

	useEffect(() => {
		let cancelled = false;
		if (!transactionId) return;
		const supabase = createClient();
		Promise.all([
			supabase.from("pos_expense_receipt_documents").select("_id,ocrStatus,merchantName,receiptTotal,receiptImageUrl").eq("transactionId", transactionId).maybeSingle(),
			supabase.from("pos_expense_inventory_links").select("_id,rawName,quantity,unit,confidence,status,inventoryId,matchMethod").eq("transactionId", transactionId).order("rawName"),
			supabase.from("pos_inventory").select("_id,ingredientName,unit").order("ingredientName").limit(500),
		]).then(([documentResult, linksResult, inventoryResult]) => {
			if (cancelled) return;
			setProjection({ document: documentResult.data ?? null, links: linksResult.data ?? [] });
			setInventoryOptions(inventoryResult.data ?? []);
		}).catch(() => {
			if (!cancelled) setProjection({ document: null, links: [] });
		});
		return () => { cancelled = true; };
	}, [transactionId]);

	const selectInventory = (linkId: string, inventoryId: string) => {
		const option = inventoryOptions.find((item) => item._id === inventoryId);
		setProjection((current) => ({
			...current,
			links: current.links.map((item) => item._id === linkId ? { ...item, inventoryId, matchMethod: "manual", confidence: 100, selectedInventoryName: option?.ingredientName } : item),
		}));
	};

	const approveLink = async (link: any) => {
		if (!link?.inventoryId || approvingId) return;
		setApprovingId(link._id);
		try {
			const supabase = createClient();
			const { error } = await supabase.schema("pos").rpc("approve_expense_inventory_link", {
				p_link_id: link._id,
				p_inventory_source_id: link.inventoryId,
				p_base_quantity: link.quantity == null ? null : Number(link.quantity),
				p_base_unit: link.unit || null,
				p_match_method: link.matchMethod || "manual",
				p_confidence: link.confidence == null ? null : Number(link.confidence),
			});
			if (error) throw error;
			setProjection((current) => ({
				...current,
				links: current.links.map((item) => item._id === link._id ? { ...item, status: "approved" } : item),
			}));
		} catch (error) {
			console.error("Failed to approve expense inventory link", error);
		} finally {
			setApprovingId(null);
		}
	};

	const status = STATUS_LABELS[tx.status] || {
		label: tx.status,
		color: "bg-gray-100 text-gray-600",
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/40" onClick={onClose} />

			{/* Modal */}
			<div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-[20px] shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
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
				<div className="p-4 space-y-4 overflow-y-auto">
					{/* Summary card */}
					<div className="rounded-xl bg-slate-50/70 p-4 space-y-3">
						<div className="flex justify-between items-start">
							<span className="text-sm text-slate-500">Tanggal</span>
							<span className="text-sm font-medium text-slate-800">
								{format(new Date(tx.date), "EEEE, dd MMMM yyyy", { locale: localeID })}
							</span>
						</div>

						<hr className="border-slate-200/80" />

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

						<hr className="border-slate-200/80" />

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

					{/* Receipt processing projection */}
					{(projection.document || projection.links.length > 0) && (
						<div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
							<div className="flex items-center justify-between">
								<span className="text-sm font-semibold text-slate-800">Inventory & OCR</span>
								<span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
									{projection.document?.ocrStatus || "Belum diproses"}
								</span>
							</div>
							{projection.links.length > 0 && (
								<div className="space-y-2">
									{projection.links.map((link) => (
										<div key={link._id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
											<div className="min-w-0"><p className="truncate font-medium text-slate-800">{link.rawName}</p><p className="text-slate-500">{link.quantity ?? "-"} {link.unit || ""}</p></div>
											<div className="flex shrink-0 items-center gap-2">
												{link.status === "pending" && !link.inventoryId && (
													<select className="max-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700" value="" onChange={(event) => selectInventory(link._id, event.target.value)}>
														<option value="">Pilih bahan</option>
														{inventoryOptions.map((option) => <option key={option._id} value={option._id}>{option.ingredientName} ({option.unit})</option>)}
													</select>
												)}
												<span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{link.status}</span>
												{link.status === "pending" && link.inventoryId && (
													<button type="button" className="rounded-lg bg-blue-600 px-2 py-1 font-medium text-white disabled:opacity-50" disabled={approvingId === link._id} onClick={() => approveLink(link)}>
														{approvingId === link._id ? "..." : "Setujui"}
													</button>
												)}
											</div>
										</div>
									))}
								</div>
							)}
							<p className="text-[11px] text-slate-500">Data ini bersifat reviewable; stok belum diubah oleh AI.</p>
						</div>
					)}

					{/* Receipt Image */}
					{receiptUrl && (
						<div className="space-y-2">
							<button
								className="w-full flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:bg-slate-50/70 hover:border-slate-400 transition-colors"
								onClick={() => setShowReceipt(!showReceipt)}
							>
								<Image className="h-4 w-4" />
								{showReceipt ? "Sembunyikan foto struk" : "Lihat foto struk"}
							</button>

							{showReceipt && (
								<div className="rounded-xl overflow-hidden border border-slate-200/80 bg-slate-100">
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

				</div>

				{/* Footer */}
				<div className="px-5 py-3 border-t border-slate-100 bg-white">
					<button
						className="w-full rounded-lg border border-slate-200/80 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50/70 transition-colors"
						onClick={onClose}
					>
						Tutup
					</button>
				</div>
			</div>
		</div>
	);
}
