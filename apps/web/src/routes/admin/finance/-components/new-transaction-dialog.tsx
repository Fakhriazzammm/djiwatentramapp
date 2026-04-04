import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Upload, Calendar, RefreshCcw, Tag } from "lucide-react";
import { useId, useState, useEffect } from "react";
import { toast } from "sonner";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";

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
		};
	};
}

export function NewTransactionDialog({
	isOpen,
	onClose,
	transaction,
}: NewTransactionDialogProps) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const updateTransaction = useMutation(api.finance.updateTransaction);
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

	useEffect(() => {
		if (isOpen) {
			if (transaction) {
				setFormData({
					type: transaction.type,
					amount: String(transaction.amount),
					category: transaction.category,
					merchant: transaction.merchant || "",
					description: transaction.description || "",
					date: new Date(transaction.date).toISOString().split("T")[0],
					paymentMethod: transaction.paymentMethod || "CASH",
					status: transaction.status || "completed",
					attachmentUrl: transaction.attachmentUrl || "",
					isRecurring: transaction.isRecurring || false,
					recurringInterval: transaction.recurringInterval || "monthly",
					tags: transaction.tags?.join(", ") || "",
				});
			} else {
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
			}
		}
	}, [isOpen, transaction]);

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
				recurringInterval: formData.isRecurring ? formData.recurringInterval : undefined,
				tags: formData.tags ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined,
			};

			if (transaction) {
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
			onClose();
		} catch (error) {
			console.error(error);
			toast.error(transaction ? "Gagal memperbarui transaksi" : "Gagal menyimpan transaksi");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
					<button
						aria-label="Tutup dialog"
						className="absolute inset-0 cursor-default bg-transparent"
						onClick={onClose}
						type="button"
					/>
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="relative w-full max-w-xl overflow-y-auto max-h-[90vh] rounded-2xl border border-border bg-card p-6 shadow-2xl"
						exit={{ opacity: 0, y: 20 }}
						initial={{ opacity: 0, y: 20 }}
					>
						<button
							className="absolute top-4 right-4 rounded-full bg-muted p-2 text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground z-10"
							onClick={onClose}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>

						<div className="flex items-center gap-3 mb-6">
							<div className={`p-2 rounded-lg ${formData.type === 'income' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
								<RefreshCcw className="h-5 w-5" />
							</div>
							<h3 className="font-bold text-2xl text-foreground tracking-tight">
								{transaction ? "Ubah Transaksi" : "Catat Transaksi"}
							</h3>
						</div>

						<form className="space-y-6" onSubmit={handleSubmit}>
							{/* Type Selection */}
							<div className="flex rounded-xl bg-muted p-1">
								<button
									className={`flex-1 rounded-lg px-4 py-2.5 font-semibold text-xs uppercase tracking-wide transition-all ${
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
									className={`flex-1 rounded-lg px-4 py-2.5 font-semibold text-xs uppercase tracking-wide transition-all ${
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

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* Left Column */}
								<div className="space-y-4">
									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={dateId}>
											<Calendar className="h-3 w-3" /> Tanggal
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={dateId}
											onChange={(e) => setFormData({ ...formData, date: e.target.value })}
											required
											type="date"
											value={formData.date}
										/>
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={amountId}>
											Nominal (Rp)
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-lg text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={amountId}
											inputMode="numeric"
											onChange={(e) => {
												const val = e.target.value.replace(/\D/g, "");
												setFormData({ ...formData, amount: val });
											}}
											placeholder="0"
											required
											type="text"
											value={formData.amount ? new Intl.NumberFormat("id-ID").format(Number(formData.amount)) : ""}
										/>
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={categoryId}>
											Kategori
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={categoryId}
											list="categories"
											onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={merchantId}>
											Merchant / Toko
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={merchantId}
											onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
											placeholder="Nama toko atau vendor..."
											value={formData.merchant}
										/>
									</div>
								</div>

								{/* Right Column */}
								<div className="space-y-4">
									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={paymentMethodId}>
											Metode Pembayaran
										</label>
										<select
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={paymentMethodId}
											onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
											value={formData.paymentMethod}
										>
											<option value="CASH">Cash</option>
											<option value="BANK_TRANSFER">Transfer Bank</option>
											<option value="QRIS">QRIS</option>
											<option value="CREDIT_CARD">Kartu Kredit</option>
										</select>
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={tagsId}>
											<Tag className="h-3 w-3" /> Tag (Pisahkan koma)
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={tagsId}
											onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
											placeholder="Tag1, Tag2..."
											value={formData.tags}
										/>
									</div>

									<div className="space-y-1.5">
										<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={attachmentId}>
											<Upload className="h-3 w-3" /> Link Lampiran / Nota
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
											id={attachmentId}
											onChange={(e) => setFormData({ ...formData, attachmentUrl: e.target.value })}
											placeholder="https://..."
											type="url"
											value={formData.attachmentUrl}
										/>
									</div>

									<div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
										<div className="flex items-center justify-between">
											<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
												<RefreshCcw className="h-3 w-3" /> Transaksi Berulang
											</label>
											<input
												type="checkbox"
												checked={formData.isRecurring}
												onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
												className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
											/>
										</div>
										
										{formData.isRecurring && (
											<select
												className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
												value={formData.recurringInterval}
												onChange={(e) => setFormData({ ...formData, recurringInterval: e.target.value as any })}
											>
												<option value="daily">Harian</option>
												<option value="weekly">Mingguan</option>
												<option value="monthly">Bulanan</option>
											</select>
										)}
									</div>
								</div>
							</div>

							<div className="space-y-1.5">
								<label className="flex items-center gap-2 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider" htmlFor={descriptionId}>
									Keterangan
								</label>
								<textarea
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
									id={descriptionId}
									onChange={(e) => setFormData({ ...formData, description: e.target.value })}
									placeholder="Catatan tambahan..."
									rows={2}
									value={formData.description}
								/>
							</div>

							<div className="flex gap-3 pt-2">
								<button
									className="flex-1 rounded-xl bg-muted py-3 font-bold text-muted-foreground text-sm transition-all hover:bg-muted/80"
									onClick={onClose}
									type="button"
								>
									Batal
								</button>
								<button
									className={`flex-[2] rounded-xl py-3 font-bold text-sm text-white shadow-lg transition-all ${
										formData.type === "income"
											? "bg-green-600 hover:bg-green-700 shadow-green-500/20"
											: "bg-red-600 hover:bg-red-700 shadow-red-500/20"
									} disabled:opacity-50`}
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting ? "Menyimpan..." : transaction ? "Simpan Perubahan" : "Simpan Transaksi"}
								</button>
							</div>
						</form>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
