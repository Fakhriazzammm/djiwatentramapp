import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	Boxes,
	Calendar,
	Plus,
	RefreshCcw,
	Tag,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

type TransactionScanItem = {
	name: string;
	quantity: number;
	price?: number;
	total?: number;
	unit?: string;
};

interface NewTransactionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	transaction?: {
		_id: Id<"financialTransactions">;
		type: "income" | "expense";
		amount: number;
		category: string;
		merchant?: string;
		description?: string;
		date: number;
		paymentMethod?: string;
		status?: "completed" | "pending" | "cancelled";
		attachmentUrl?: string;
		sourceFingerprint?: string;
		isRecurring?: boolean;
		recurringInterval?: "daily" | "weekly" | "monthly";
		tags?: string[];
		metadata?: {
			source?: string;
			inputMode?: string;
			aiSessionId?: string;
			importedAt?: number;
			rawText?: string;
			sourceRef?: string;
			sourceLabel?: string;
			receiptDetails?: {
				merchantName?: string;
				receiptNumber?: string;
				date?: string;
				time?: string;
				subtotal?: number;
				tax?: number;
				serviceCharge?: number;
				discount?: number;
				total?: number;
			};
			syncSource?: string;
			syncOutcome?: string;
			syncWarnings?: string[];
			scanItems?: TransactionScanItem[];
		};
		displayTitle?: string | null;
		displaySummary?: string | null;
		detailItems?: Array<{ label: string; value: string }>;
	};
}

function createEmptyItem(): TransactionScanItem {
	return {
		name: "",
		quantity: 1,
		price: undefined,
		total: undefined,
		unit: "",
	};
}

function isInventorySyncCategory(category: string) {
	const normalized = category.trim().toLowerCase().replace(/\s+/g, "_");
	return (
		normalized === "belanja_stok" ||
		normalized === "pembelian_stok" ||
		normalized === "bahan_baku"
	);
}

export function NewTransactionDialog({
	isOpen,
	onClose,
	transaction,
}: NewTransactionDialogProps) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const updateTransaction = useMutation(api.finance.updateTransaction);
	const recordExpense = useMutation((api as any).expenseIntake.recordExpense);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const dateId = useId();
	const amountId = useId();
	const categoryId = useId();
	const merchantId = useId();
	const paymentMethodId = useId();
	const descriptionId = useId();
	const attachmentId = useId();
	const tagsId = useId();

	const [formData, setFormData] = useState({
		type: "expense" as "income" | "expense",
		amount: "",
		category: "",
		merchant: "",
		description: "",
		date: new Date().toISOString().split("T")[0],
		paymentMethod: "CASH",
		status: "completed" as "completed" | "pending" | "cancelled",
		attachmentUrl: "",
		isRecurring: false,
		recurringInterval: "monthly" as "daily" | "weekly" | "monthly",
		tags: "",
	});
	const [lineItems, setLineItems] = useState<TransactionScanItem[]>([]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		if (transaction) {
			setFormData({
				type: transaction.type,
				amount: String(transaction.amount),
				category: transaction.category,
				merchant:
					transaction.merchant ||
					transaction.metadata?.receiptDetails?.merchantName ||
					"",
				description: transaction.description || "",
				date: new Date(transaction.date).toISOString().split("T")[0],
				paymentMethod: transaction.paymentMethod || "CASH",
				status: transaction.status || "completed",
				attachmentUrl: transaction.attachmentUrl || "",
				isRecurring: transaction.isRecurring || false,
				recurringInterval: transaction.recurringInterval || "monthly",
				tags: transaction.tags?.join(", ") || "",
			});
			setLineItems(
				transaction.metadata?.scanItems?.map((item) => ({
					name: item.name,
					quantity: item.quantity,
					price: item.price,
					total: item.total,
					unit: item.unit || "",
				})) || [],
			);
			return;
		}

		setFormData({
			type: "expense",
			amount: "",
			category: "",
			merchant: "",
			description: "",
			date: new Date().toISOString().split("T")[0],
			paymentMethod: "CASH",
			status: "completed",
			attachmentUrl: "",
			isRecurring: false,
			recurringInterval: "monthly",
			tags: "",
		});
		setLineItems([]);
	}, [isOpen, transaction]);

	const normalizedLineItems = lineItems
		.map((item) => ({
			name: item.name.trim(),
			quantity: Number(item.quantity) || 1,
			price:
				item.price !== undefined &&
				item.price !== null &&
				Number.isFinite(Number(item.price))
					? Number(item.price)
					: undefined,
			total:
				item.total !== undefined &&
				item.total !== null &&
				Number.isFinite(Number(item.total))
					? Number(item.total)
					: undefined,
			unit: item.unit?.trim() || undefined,
		}))
		.filter((item) => item.name);

	const amountValue = Number(formData.amount) || 0;
	const itemTotal = normalizedLineItems.reduce((sum, item) => {
		return sum + (Number(item.total) || (Number(item.price) || 0) * item.quantity);
	}, 0);
	const totalDiff = Math.abs(itemTotal - amountValue);
	const hasLargeMismatch =
		normalizedLineItems.length > 0 &&
		amountValue > 0 &&
		totalDiff >= 1000 &&
		totalDiff / Math.max(itemTotal, amountValue) >= 0.1;
	const willSyncInventory =
		formData.type === "expense" &&
		normalizedLineItems.length > 0 &&
		isInventorySyncCategory(formData.category);

	const updateLineItem = (
		index: number,
		field: keyof TransactionScanItem,
		value: string | number | undefined,
	) => {
		setLineItems((prev) =>
			prev.map((item, itemIndex) =>
				itemIndex === index ? { ...item, [field]: value } : item,
			),
		);
	};

	const addLineItem = () => {
		setLineItems((prev) => [...prev, createEmptyItem()]);
	};

	const removeLineItem = (index: number) => {
		setLineItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
	};

	const resetDialog = () => {
		setLineItems([]);
		setFormData({
			type: "expense",
			amount: "",
			category: "",
			merchant: "",
			description: "",
			date: new Date().toISOString().split("T")[0],
			paymentMethod: "CASH",
			status: "completed",
			attachmentUrl: "",
			isRecurring: false,
			recurringInterval: "monthly",
			tags: "",
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(formData.amount && formData.category)) {
			toast.error("Mohon lengkapi data");
			return;
		}

		setIsSubmitting(true);
		try {
			const commonData = {
				type: formData.type,
				amount: Number(formData.amount),
				category: formData.category,
				merchant: formData.merchant || undefined,
				description: formData.description || undefined,
				date: new Date(formData.date).getTime(),
				paymentMethod: formData.paymentMethod,
				status: formData.status,
				attachmentUrl: formData.attachmentUrl || undefined,
				isRecurring: formData.isRecurring,
				recurringInterval: formData.isRecurring
					? formData.recurringInterval
					: undefined,
				tags: formData.tags
					? formData.tags
							.split(",")
							.map((tag) => tag.trim())
							.filter(Boolean)
					: undefined,
			};

			const shouldUseExpenseIntake =
				formData.type === "expense" ||
				normalizedLineItems.length > 0 ||
				(transaction?.metadata?.scanItems?.length ?? 0) > 0;

			if (shouldUseExpenseIntake) {
				const result = await recordExpense({
					source: transaction?.metadata?.source || "manual_form",
					rawText: formData.description || transaction?.metadata?.rawText,
					existingTransactionId: transaction?._id,
					sourceFingerprint: transaction?.sourceFingerprint,
					syncMode: "auto",
					transaction: commonData,
					items:
						normalizedLineItems.length > 0 ? normalizedLineItems : undefined,
					metadata: {
						inputMode: "manual_transaction_dialog",
						aiSessionId: transaction?.metadata?.aiSessionId,
						sourceRef: transaction?.metadata?.sourceRef,
						sourceLabel: transaction?.metadata?.sourceLabel || "Manual Form",
						receiptDetails: transaction?.metadata?.receiptDetails,
					},
				});

				const successMessage =
					result?.syncOutcome === "finance_plus_inventory"
						? `Transaksi dan stok berhasil disinkronkan${result?.hppUpdatedCalculations ? `, HPP terbarui di ${result.hppUpdatedCalculations} kalkulasi` : ""}`
						: transaction
							? "Transaksi berhasil diperbarui"
							: "Transaksi berhasil disimpan";
				toast.success(successMessage);
			} else if (transaction) {
				await updateTransaction({
					id: transaction._id,
					...commonData,
					metadata: transaction.metadata,
				});
				toast.success("Transaksi berhasil diperbarui");
			} else {
				await createTransaction(commonData);
				toast.success("Transaksi berhasil disimpan");
			}

			resetDialog();
			onClose();
		} catch (error) {
			console.error(error);
			toast.error(
				transaction ? "Gagal memperbarui transaksi" : "Gagal menyimpan transaksi",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
					data-admin-modal-backdrop
				>
					<button
						aria-label="Tutup dialog"
						className="absolute inset-0 cursor-default bg-transparent"
						onClick={onClose}
						type="button"
					/>
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
						data-admin-modal-card
						exit={{ opacity: 0, y: 20 }}
						initial={{ opacity: 0, y: 20 }}
					>
						<button
							className="absolute top-4 right-4 z-10 rounded-full bg-muted p-2 text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground"
							onClick={onClose}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>

						<div className="mb-6 flex items-center gap-3">
							<div
								className={`rounded-lg p-2 ${
									formData.type === "income"
										? "bg-green-500/10 text-green-600"
										: "bg-red-500/10 text-red-600"
								}`}
							>
								<RefreshCcw className="h-5 w-5" />
							</div>
							<h3 className="text-2xl font-bold tracking-tight text-foreground">
								{transaction ? "Ubah Transaksi" : "Catat Transaksi"}
							</h3>
						</div>

						<form className="space-y-6" onSubmit={handleSubmit}>
							<div className="flex rounded-xl bg-muted p-1">
								<button
									className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-all ${
										formData.type === "income"
											? "bg-green-600 text-white shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => setFormData({ ...formData, type: "income" })}
									type="button"
								>
									Pemasukan
								</button>
								<button
									className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-all ${
										formData.type === "expense"
											? "bg-red-600 text-white shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => setFormData({ ...formData, type: "expense" })}
									type="button"
								>
									Pengeluaran
								</button>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-4">
									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={dateId}
										>
											<Calendar className="h-3 w-3" /> Tanggal
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={dateId}
											onChange={(e) =>
												setFormData({ ...formData, date: e.target.value })
											}
											required
											type="date"
											value={formData.date}
										/>
									</div>

									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={amountId}
										>
											Nominal (Rp)
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-bold text-foreground transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={amountId}
											inputMode="numeric"
											onChange={(e) => {
												const value = e.target.value.replace(/\D/g, "");
												setFormData({ ...formData, amount: value });
											}}
											placeholder="0"
											required
											type="text"
											value={
												formData.amount
													? new Intl.NumberFormat("id-ID").format(
															Number(formData.amount),
														)
													: ""
											}
										/>
									</div>

									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={categoryId}
										>
											Kategori
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={categoryId}
											list="categories"
											onChange={(e) =>
												setFormData({ ...formData, category: e.target.value })
											}
											placeholder="Pilih atau ketik kategori..."
											required
											value={formData.category}
										/>
										<datalist id="categories">
											<option value="makanan_minuman" />
											<option value="belanja_stok" />
											<option value="peralatan_kantor" />
											<option value="transportasi" />
											<option value="utilitas_listrik_air" />
											<option value="gaji_karyawan" />
											<option value="sewa_tempat" />
											<option value="pemasaran" />
											<option value="pajak" />
											<option value="hiburan" />
											<option value="kesehatan" />
											<option value="pembangunan_renovasi" />
											<option value="lainnya" />
										</datalist>
										{formData.type === "expense" &&
											normalizedLineItems.length > 0 && (
												<div
													className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
														willSyncInventory
															? "border-emerald-200 bg-emerald-50 text-emerald-700"
															: "border-amber-200 bg-amber-50 text-amber-700"
													}`}
												>
													<div className="flex items-start gap-2">
														<Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" />
														<span>
															{willSyncInventory
																? "Kategori ini akan otomatis menyimpan pengeluaran ke keuangan, menambah stok inventory, dan sinkronkan HPP."
																: "Detail item tetap disimpan di transaksi keuangan, tetapi kategori ini tidak memicu sinkron inventory otomatis."}
														</span>
													</div>
												</div>
											)}
									</div>

									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={merchantId}
										>
											Merchant / Toko
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={merchantId}
											onChange={(e) =>
												setFormData({ ...formData, merchant: e.target.value })
											}
											placeholder="Nama toko atau vendor..."
											value={formData.merchant}
										/>
									</div>
								</div>

								<div className="space-y-4">
									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={paymentMethodId}
										>
											Metode Pembayaran
										</label>
										<select
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={paymentMethodId}
											onChange={(e) =>
												setFormData({
													...formData,
													paymentMethod: e.target.value,
												})
											}
											value={formData.paymentMethod}
										>
											<option value="CASH">Cash</option>
											<option value="BANK_TRANSFER">Transfer Bank</option>
											<option value="QRIS">QRIS</option>
											<option value="CREDIT_CARD">Kartu Kredit</option>
										</select>
									</div>

									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={tagsId}
										>
											<Tag className="h-3 w-3" /> Tag (Pisahkan koma)
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={tagsId}
											onChange={(e) =>
												setFormData({ ...formData, tags: e.target.value })
											}
											placeholder="Tag1, Tag2..."
											value={formData.tags}
										/>
									</div>

									<div className="space-y-1.5">
										<label
											className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
											htmlFor={attachmentId}
										>
											<Upload className="h-3 w-3" /> Link Lampiran / Nota
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={attachmentId}
											onChange={(e) =>
												setFormData({
													...formData,
													attachmentUrl: e.target.value,
												})
											}
											placeholder="https://..."
											type="url"
											value={formData.attachmentUrl}
										/>
									</div>

									<div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
										<div className="flex items-center justify-between">
											<label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
												<RefreshCcw className="h-3 w-3" /> Transaksi Berulang
											</label>
											<input
												checked={formData.isRecurring}
												className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
												onChange={(e) =>
													setFormData({
														...formData,
														isRecurring: e.target.checked,
													})
												}
												type="checkbox"
											/>
										</div>

										{formData.isRecurring && (
											<select
												className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
												onChange={(e) =>
													setFormData({
														...formData,
														recurringInterval: e.target.value as
															| "daily"
															| "weekly"
															| "monthly",
													})
												}
												value={formData.recurringInterval}
											>
												<option value="daily">Harian</option>
												<option value="weekly">Mingguan</option>
												<option value="monthly">Bulanan</option>
											</select>
										)}
									</div>
								</div>
							</div>

							{formData.type === "expense" && (
								<div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
									<div className="flex items-center justify-between gap-3">
										<div>
											<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
												<Boxes className="h-4 w-4 text-primary" />
												Detail Item Pengeluaran
											</div>
											<p className="mt-1 text-[11px] text-muted-foreground">
												Tambahkan item bila pengeluaran ini berasal dari belanja stok atau pembelian barang rinci.
											</p>
										</div>
										<button
											className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted"
											onClick={addLineItem}
											type="button"
										>
											<Plus className="h-3.5 w-3.5" />
											Tambah Item
										</button>
									</div>

									{lineItems.length > 0 ? (
										<div className="space-y-3">
											{lineItems.map((item, index) => (
												<div
													className="rounded-lg border border-border bg-background p-3"
													key={`line-item-${index}`}
												>
													<div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_0.6fr_0.8fr_0.9fr_auto]">
														<input
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
															onChange={(e) =>
																updateLineItem(index, "name", e.target.value)
															}
															placeholder="Nama item"
															value={item.name}
														/>
														<input
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
															min="0"
															onChange={(e) =>
																updateLineItem(
																	index,
																	"quantity",
																	Number(e.target.value),
																)
															}
															placeholder="Qty"
															type="number"
															value={item.quantity}
														/>
														<input
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
															min="0"
															onChange={(e) =>
																updateLineItem(
																	index,
																	"price",
																	e.target.value
																		? Number(e.target.value)
																		: undefined,
																)
															}
															placeholder="Harga/unit"
															type="number"
															value={item.price ?? ""}
														/>
														<input
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
															min="0"
															onChange={(e) =>
																updateLineItem(
																	index,
																	"total",
																	e.target.value
																		? Number(e.target.value)
																		: undefined,
																)
															}
															placeholder="Total"
															type="number"
															value={item.total ?? ""}
														/>
														<button
															className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 transition-all hover:bg-red-100"
															onClick={() => removeLineItem(index)}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
													<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[0.7fr_1fr]">
														<input
															className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
															onChange={(e) =>
																updateLineItem(index, "unit", e.target.value)
															}
															placeholder="Satuan, contoh: pcs / kg / liter"
															value={item.unit ?? ""}
														/>
														<div className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
															Total item ini:{" "}
															<span className="font-semibold text-foreground">
																Rp{" "}
																{(
																	Number(item.total) ||
																	(Number(item.price) || 0) *
																		(Number(item.quantity) || 1)
																).toLocaleString("id-ID")}
															</span>
														</div>
													</div>
												</div>
											))}

											<div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
												<div className="flex items-center justify-between">
													<span className="font-medium text-muted-foreground">
														Total item
													</span>
													<span className="font-bold text-foreground">
														Rp {itemTotal.toLocaleString("id-ID")}
													</span>
												</div>
												<div className="mt-1 flex items-center justify-between">
													<span className="font-medium text-muted-foreground">
														Nominal transaksi
													</span>
													<span className="font-bold text-foreground">
														Rp {amountValue.toLocaleString("id-ID")}
													</span>
												</div>
												{hasLargeMismatch && (
													<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
														<div className="flex items-start gap-2">
															<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
															<span>
																Nominal transaksi dan total detail item berbeda cukup besar. Data tetap bisa disimpan, tetapi sebaiknya dicek lagi.
															</span>
														</div>
													</div>
												)}
											</div>
										</div>
									) : (
										<div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
											Belum ada item. Tambahkan item jika ingin menyimpan pengeluaran detail atau sinkron otomatis ke inventory.
										</div>
									)}
								</div>
							)}

							<div className="space-y-1.5">
								<label
									className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
									htmlFor={descriptionId}
								>
									Keterangan
								</label>
								{transaction?.detailItems &&
									transaction.detailItems.length > 0 && (
										<div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-2">
											{transaction.detailItems.map((detail, index) => (
												<div
													className="rounded-md bg-background px-3 py-2"
													key={`${detail.label}-${index}`}
												>
													<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
														{detail.label}
													</div>
													<div className="text-sm font-medium text-foreground">
														{detail.value}
													</div>
												</div>
											))}
										</div>
									)}
								{transaction?.metadata?.syncWarnings &&
									transaction.metadata.syncWarnings &&
									transaction.metadata.syncWarnings.length > 0 && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
											{transaction.metadata.syncWarnings.join(" ")}
										</div>
									)}
								<textarea
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
									id={descriptionId}
									onChange={(e) =>
										setFormData({ ...formData, description: e.target.value })
									}
									placeholder="Catatan tambahan..."
									rows={2}
									value={formData.description}
								/>
							</div>

							<div className="flex gap-3 pt-2">
								<button
									className="flex-1 rounded-xl bg-muted py-3 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/80"
									onClick={onClose}
									type="button"
								>
									Batal
								</button>
								<button
									className={`flex-[2] rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all ${
										formData.type === "income"
											? "bg-green-600 shadow-green-500/20 hover:bg-green-700"
											: "bg-red-600 shadow-red-500/20 hover:bg-red-700"
									} disabled:opacity-50`}
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting
										? "Menyimpan..."
										: transaction
											? "Simpan Perubahan"
											: "Simpan Transaksi"}
								</button>
							</div>
						</form>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
