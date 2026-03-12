import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useState, useEffect } from "react";
import { toast } from "sonner";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";

interface NewTransactionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	initialData?: {
		_id: Id<"financialTransactions">;
		type: "income" | "expense";
		amount: number;
		category: string;
		merchant?: string;
		description?: string;
		date: number;
		paymentMethod?: string;
	};
}

export function NewTransactionDialog({
	isOpen,
	onClose,
	initialData,
}: NewTransactionDialogProps) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const updateTransaction = useMutation(api.finance.updateTransaction);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const dateId = useId();
	const amountId = useId();
	const categoryId = useId();
	const paymentMethodId = useId();
	const descriptionId = useId();

	const [formData, setFormData] = useState({
		type: "expense" as "income" | "expense",
		amount: "",
		category: "",
		merchant: "",
		description: "",
		date: new Date().toISOString().split("T")[0],
		paymentMethod: "CASH",
	});

	useEffect(() => {
		if (isOpen) {
			if (initialData) {
				setFormData({
					type: initialData.type,
					amount: String(initialData.amount),
					category: initialData.category,
					merchant: initialData.merchant || "",
					description: initialData.description || "",
					date: new Date(initialData.date).toISOString().split("T")[0],
					paymentMethod: initialData.paymentMethod || "CASH",
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
				});
			}
		}
	}, [isOpen, initialData]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(formData.amount && formData.category)) {
			toast.error("Mohon lengkapi data");
			return;
		}

		setIsSubmitting(true);
		try {
			if (initialData) {
				await updateTransaction({
					id: initialData._id,
					type: formData.type,
					amount: Number(formData.amount),
					category: formData.category,
					merchant: formData.merchant || undefined,
					description: formData.description,
					date: new Date(formData.date).getTime(),
					paymentMethod: formData.paymentMethod,
				});
				toast.success("Transaksi berhasil diperbarui");
			} else {
				await createTransaction({
					type: formData.type,
					amount: Number(formData.amount),
					category: formData.category,
					merchant: formData.merchant || undefined,
					description: formData.description,
					date: new Date(formData.date).getTime(),
					paymentMethod: formData.paymentMethod,
					status: "completed",
				});
				toast.success("Transaksi berhasil disimpan");
			}
			onClose();
		} catch (error) {
			console.error(error);
			toast.error(initialData ? "Gagal memperbarui transaksi" : "Gagal menyimpan transaksi");
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
						animate={{ opacity: 1, scale: 1 }}
						className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-2xl"
						exit={{ opacity: 0, scale: 0.95 }}
						initial={{ opacity: 0, scale: 0.95 }}
					>
						<button
							className="absolute top-4 right-4 rounded-full bg-muted p-2 text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground"
							onClick={onClose}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>

						<h3 className="mb-6 font-bold text-2xl text-foreground tracking-tight">
							{initialData ? "Ubah Transaksi" : "Catat Transaksi"}
						</h3>

						<form className="space-y-5" onSubmit={handleSubmit}>
							{/* Type Selection */}
							<div className="flex rounded-xl bg-muted p-1">
								<button
									className={`flex-1 rounded-lg px-4 py-2.5 font-semibold text-xs uppercase tracking-wide transition-all ${
										formData.type === "income"
											? "bg-primary text-primary-foreground shadow-sm"
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
											? "bg-destructive text-destructive-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => setFormData({ ...formData, type: "expense" })}
									type="button"
								>
									Pengeluaran
								</button>
							</div>

							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<label
											className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
											htmlFor={dateId}
										>
											Tanggal
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-medium text-foreground text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
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
											className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
											htmlFor={amountId}
										>
											Nominal
										</label>
										<input
											className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-semibold text-foreground text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
											id={amountId}
											min="0"
											onChange={(e) =>
												setFormData({ ...formData, amount: e.target.value })
											}
											placeholder="Rp 0"
											required
											type="number"
											value={formData.amount}
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<label
										className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
										htmlFor={categoryId}
									>
										Kategori
									</label>
									<input
										className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-medium text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
										id={categoryId}
										list="categories"
										onChange={(e) =>
											setFormData({ ...formData, category: e.target.value })
										}
										placeholder="Contoh: Gaji, Listrik, Penjualan"
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
									<label
										className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
									>
										Merchant/Toko (Opsional)
									</label>
									<input
										className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-medium text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
										onChange={(e) =>
											setFormData({ ...formData, merchant: e.target.value })
										}
										placeholder="Contoh: Indomaret, Starbucks, PLN"
										value={formData.merchant}
									/>
								</div>

								<div className="space-y-1.5">
									<label
										className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
										htmlFor={paymentMethodId}
									>
										Metode Pembayaran
									</label>
									<select
										className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2.5 font-medium text-foreground text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
										id={paymentMethodId}
										onChange={(e) =>
											setFormData({
												...formData,
												paymentMethod: e.target.value,
											})
										}
										value={formData.paymentMethod}
									>
										<option value="CASH">Tunai (Cash)</option>
										<option value="TRANSFER">Transfer Bank</option>
										<option value="QRIS">QRIS</option>
										<option value="OTHER">Lainnya</option>
									</select>
								</div>

								<div className="space-y-1.5">
									<label
										className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
										htmlFor={descriptionId}
									>
										Keterangan (Opsional)
									</label>
									<textarea
										className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
										id={descriptionId}
										onChange={(e) =>
											setFormData({ ...formData, description: e.target.value })
										}
										placeholder="Catatan tambahan..."
										rows={3}
										value={formData.description}
									/>
								</div>
							</div>

							<div className="pt-2">
								<button
									className={`w-full rounded-lg py-3.5 font-semibold text-sm uppercase tracking-wide transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 ${
										formData.type === "income"
											? "bg-primary text-primary-foreground"
											: "bg-destructive text-destructive-foreground"
									}`}
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting ? "MENYIMPAN..." : initialData ? "SIMPAN PERUBAHAN" : "SIMPAN TRANSAKSI"}
								</button>
							</div>
						</form>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
