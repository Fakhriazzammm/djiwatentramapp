import { api } from "@tkmpos/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

interface NewTransactionDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export function NewTransactionDialog({
	isOpen,
	onClose,
}: NewTransactionDialogProps) {
	const createTransaction = useMutation(api.finance.createTransaction);
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
		description: "",
		date: new Date().toISOString().split("T")[0],
		paymentMethod: "CASH",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(formData.amount && formData.category)) {
			toast.error("Mohon lengkapi data");
			return;
		}

		setIsSubmitting(true);
		try {
			await createTransaction({
				type: formData.type,
				amount: Number(formData.amount),
				category: formData.category,
				description: formData.description,
				date: new Date(formData.date).getTime(),
				paymentMethod: formData.paymentMethod,
				status: "completed",
			});
			toast.success("Transaksi berhasil disimpan");
			setFormData({
				type: "expense",
				amount: "",
				category: "",
				description: "",
				date: new Date().toISOString().split("T")[0],
				paymentMethod: "CASH",
			});
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan transaksi");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
					<button
						aria-label="Tutup dialog"
						className="absolute inset-0 cursor-default bg-transparent"
						onClick={onClose}
						type="button"
					/>
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="relative w-full max-w-lg rounded-[40px] border border-[#4A3728]/10 bg-[#F5F0E1] p-10"
						exit={{ opacity: 0, scale: 0.95 }}
						initial={{ opacity: 0, scale: 0.95 }}
					>
						<button
							className="absolute top-6 right-6 rounded-full bg-[#4A3728]/10 p-2 text-[#4A3728] transition-all hover:bg-[#4A3728]/20"
							onClick={onClose}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>

						<h3 className="mb-8 font-black text-3xl text-[#4A3728] tracking-tight">
							Catat Transaksi
						</h3>

						<form className="space-y-6" onSubmit={handleSubmit}>
							{/* Type Selection */}
							<div className="flex rounded-[24px] bg-[#E8E1CF] p-1.5 shadow-inner">
								<button
									className={`flex-1 rounded-[20px] py-4 font-bold text-[10px] uppercase tracking-widest transition-all ${
										formData.type === "income"
											? "bg-[#4A3728] text-[#F5F0E1]"
											: "text-[#4A3728]/40 hover:text-[#4A3728]"
									}`}
									onClick={() => setFormData({ ...formData, type: "income" })}
									type="button"
								>
									Pemasukan
								</button>
								<button
									className={`flex-1 rounded-[20px] py-4 font-bold text-[10px] uppercase tracking-widest transition-all ${
										formData.type === "expense"
											? "bg-[#4A3728] text-[#F5F0E1]"
											: "text-[#4A3728]/40 hover:text-[#4A3728]"
									}`}
									onClick={() => setFormData({ ...formData, type: "expense" })}
									type="button"
								>
									Pengeluaran
								</button>
							</div>

							<div className="space-y-6">
								<div className="grid grid-cols-2 gap-5">
									<div className="space-y-2">
										<label
											className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
											htmlFor={dateId}
										>
											Tanggal
										</label>
										<input
											className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
											id={dateId}
											onChange={(e) =>
												setFormData({ ...formData, date: e.target.value })
											}
											required
											type="date"
											value={formData.date}
										/>
									</div>
									<div className="space-y-2">
										<label
											className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
											htmlFor={amountId}
										>
											Nominal
										</label>
										<input
											className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-black text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
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

								<div className="space-y-2">
									<label
										className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
										htmlFor={categoryId}
									>
										Kategori
									</label>
									<input
										className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
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
										<option value="Penjualan" />
										<option value="Gaji Karyawan" />
										<option value="Bahan Baku" />
										<option value="Listrik & Air" />
										<option value="Operasional" />
										<option value="Lainnya" />
									</datalist>
								</div>

								<div className="space-y-2">
									<label
										className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
										htmlFor={paymentMethodId}
									>
										Metode Pembayaran
									</label>
									<select
										className="w-full appearance-none rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
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

								<div className="space-y-2">
									<label
										className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
										htmlFor={descriptionId}
									>
										Keterangan (Opsional)
									</label>
									<textarea
										className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-medium text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
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

							<div className="pt-4">
								<button
									className="w-full rounded-[32px] bg-[#4A3728] py-5 font-bold text-[#F5F0E1] text-[10px] uppercase tracking-[0.2em] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
									disabled={isSubmitting}
									type="submit"
								>
									{isSubmitting ? "MENYIMPAN..." : "SIMPAN TRANSAKSI"}
								</button>
							</div>
						</form>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
