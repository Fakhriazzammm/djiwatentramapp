import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Percent, Tag, Ticket, X } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AppliedVoucher } from "@/context/cart-context";

interface VoucherModalProps {
	isOpen: boolean;
	onClose: () => void;
	appliedVoucher: AppliedVoucher | null;
	onApplyVoucher: (voucher: AppliedVoucher | null) => void;
	cartTotal: number;
}

function isVoucherAvailable(d: Doc<"discounts">): {
	available: boolean;
	reason?: string;
} {
	// Only ALL target type can be used as vouchers (CATEGORY/PRODUCT are auto-applied to products)
	if (d.targetType !== "ALL") {
		return {
			available: false,
			reason: "Diskon ini otomatis berlaku untuk produk",
		};
	}

	if (!d.isActive) {
		return { available: false, reason: "Tidak aktif" };
	}

	const now = new Date();
	const timestamp = now.getTime();

	if (d.startDate && timestamp < d.startDate) {
		return { available: false, reason: "Belum dimulai" };
	}
	if (d.endDate && timestamp > d.endDate) {
		return { available: false, reason: "Sudah berakhir" };
	}

	const day = now.getDay();
	if (d.days && d.days.length > 0 && !d.days.includes(day)) {
		return { available: false, reason: "Tidak berlaku hari ini" };
	}

	if (d.startTime && d.endTime) {
		const [startH, startM] = d.startTime.split(":").map(Number);
		const [endH, endM] = d.endTime.split(":").map(Number);
		const start = startH * 60 + startM;
		const end = endH * 60 + endM;
		const current = now.getHours() * 60 + now.getMinutes();

		if (current < start || current > end) {
			return {
				available: false,
				reason: `Hanya berlaku ${d.startTime}-${d.endTime}`,
			};
		}
	}

	return { available: true };
}

function getDiscountValue(d: Doc<"discounts">, _cartTotal: number): string {
	if (d.type === "PERCENTAGE") {
		return `${d.value}%`;
	}
	if (d.type === "FIXED") {
		return `Rp ${new Intl.NumberFormat("id-ID").format(d.value)}`;
	}
	return `Rp ${new Intl.NumberFormat("id-ID").format(d.value)}`;
}

export function VoucherModal({
	isOpen,
	onClose,
	appliedVoucher,
	onApplyVoucher,
	cartTotal,
}: VoucherModalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const allDiscounts = useQuery(api.discounts.getDiscounts);

	const availableVouchers =
		allDiscounts?.filter((d: Doc<"discounts">) => isVoucherAvailable(d).available) || [];

	const handleSelectVoucher = (discount: Doc<"discounts">) => {
		if (appliedVoucher?._id === discount._id) {
			onApplyVoucher(null);
		} else {
			onApplyVoucher({
				_id: discount._id,
				name: discount.name,
				type: discount.type,
				value: discount.value,
				targetType: discount.targetType,
				targetIds: (discount as { targetIds?: string[] }).targetIds,
			});
		}
	};

	const handleRemoveVoucher = () => {
		onApplyVoucher(null);
	};

	const modalContent = (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-md"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="fixed right-0 bottom-0 left-0 z-[9999] mx-auto max-w-md rounded-t-3xl border border-border bg-card shadow-2xl"
						exit={{ opacity: 0, y: 100 }}
						initial={{ opacity: 0, y: 100 }}
						transition={{ type: "spring", damping: 25, stiffness: 300 }}
					>
						<div className="flex max-h-[80vh] flex-col">
							<div className="flex items-center justify-between border-border border-b p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
										<Ticket className="h-5 w-5 text-primary" />
									</div>
									<div>
										<h2 className="font-bold text-foreground text-lg">
											Pilih Voucher
										</h2>
										<p className="text-muted-foreground text-xs">
											{availableVouchers.length} voucher tersedia
										</p>
									</div>
								</div>
								<button
									className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onClick={onClose}
									type="button"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="flex-1 space-y-3 overflow-y-auto p-4">
								{availableVouchers.length === 0 ? (
									<div className="py-12 text-center">
										<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
											<Tag className="h-8 w-8 text-muted-foreground" />
										</div>
										<p className="text-muted-foreground text-sm">
											Tidak ada voucher tersedia saat ini
										</p>
									</div>
								) : (
									availableVouchers.map((discount: Doc<"discounts">) => {
										const isSelected = appliedVoucher?._id === discount._id;
										const meetsMinOrder = discount.minOrderValue
											? cartTotal >= discount.minOrderValue
											: true;

										return (
											<motion.button
												animate={{ scale: 1 }}
												className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
													isSelected
														? "border-primary bg-primary/10"
														: "border-border bg-background hover:border-primary/50"
												} ${meetsMinOrder ? "" : "opacity-50"}`}
												disabled={!meetsMinOrder}
												key={discount._id}
												onClick={() => handleSelectVoucher(discount)}
												type="button"
												whileHover={{ scale: meetsMinOrder ? 1.02 : 1 }}
												whileTap={{ scale: meetsMinOrder ? 0.98 : 1 }}
											>
												<div className="flex items-start justify-between gap-3">
													<div className="flex items-start gap-3">
														<div
															className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
																discount.type === "PERCENTAGE"
																	? "bg-primary/10"
																	: "bg-accent/10"
															}`}
														>
															{discount.type === "PERCENTAGE" ? (
																<Percent className="h-6 w-6 text-primary" />
															) : (
																<Tag className="h-6 w-6 text-accent" />
															)}
														</div>
														<div>
															<h3 className="font-semibold text-foreground text-sm">
																{discount.name}
															</h3>
															{discount.code && (
																<code className="mt-1 inline-block rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
																	{discount.code}
																</code>
															)}
															<p className="mt-1 font-bold text-lg text-primary">
																{getDiscountValue(discount, cartTotal)} OFF
															</p>
															{discount.minOrderValue && (
																<p className="mt-1 text-muted-foreground text-xs">
																	Min. pesanan Rp{" "}
																	{new Intl.NumberFormat("id-ID").format(
																		discount.minOrderValue
																	)}
																</p>
															)}
														</div>
													</div>
													<div
														className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
															isSelected
																? "bg-primary"
																: "border-2 border-border"
														}`}
													>
														{isSelected && (
															<Check className="h-4 w-4 text-primary-foreground" />
														)}
													</div>
												</div>
											</motion.button>
										);
									})
								)}
							</div>

							{appliedVoucher && (
								<div className="border-border border-t p-4">
									<button
										className="w-full rounded-lg border border-destructive/20 bg-destructive/10 py-3 font-semibold text-destructive text-sm transition-all hover:bg-destructive/20"
										onClick={handleRemoveVoucher}
										type="button"
									>
										Hapus Voucher
									</button>
								</div>
							)}
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);

	if (!mounted) return null;

	return createPortal(modalContent, document.body);
}
