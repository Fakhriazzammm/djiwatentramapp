import { useState, useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem } from "./types";
import { currency } from "./types";

export function ProductSheet({
	discounts,
	onAdd,
	onClose,
	product,
}: {
	discounts: Doc<"discounts">[];
	onAdd: (item: CartItem) => void;
	onClose: () => void;
	product: Doc<"products"> | null;
}) {
	const [quantity, setQuantity] = useState(1);
	const [variants, setVariants] = useState<Record<string, string>>({});
	useEffect(() => {
		setQuantity(1);
		setVariants({});
	}, [product]);
	if (!product) return null;
	const groups = Array.isArray(product.variations)
		? (product.variations as Array<{
				type: string;
				options: Array<{ name: string; price: number }>;
		  }>)
		: [];
	const pricing = calculateEffectivePrice(
		{ _id: product._id, price: product.price, categoryId: product.categoryId },
		discounts
	);
	const variantPrice = Object.entries(variants).reduce((sum, [groupName, optionName]) => {
		const group = groups.find((entry) => entry.type === groupName);
		const option = group?.options.find((entry) => entry.name === optionName);
		return sum + (option?.price ?? 0);
	}, 0);
	const unitPrice = pricing.finalPrice + variantPrice;
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="relative h-48 bg-muted">
				{product.image ? (
					<img
						alt={product.name}
						className="h-full w-full object-cover"
						src={product.image}
					/>
				) : null}
				<button
					type="button"
					className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
					aria-label="Tutup detail produk"
					onClick={onClose}
				>
					<X className="h-3.5 w-3.5" />
				</button>
				{product.menuNumber != null ? (
					<span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-bold text-white">
						#{product.menuNumber}
					</span>
				) : null}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				<h3 className="font-display text-xl font-black tracking-tight">{product.name}</h3>
				{product.description ? (
					<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						{product.description}
					</p>
				) : null}
				<div className="mt-3 flex items-center gap-2.5">
					<span className="text-xl font-black text-primary">
						{currency(unitPrice)}
					</span>
					{pricing.isPromo ? (
						<span className="text-xs font-semibold text-muted-foreground line-through">
							{currency(pricing.originalPrice + variantPrice)}
						</span>
					) : null}
				</div>
				{groups.length > 0 ? (
					<div className="mt-4 space-y-4">
						{groups.map((group) => (
							<div key={group.type} className="space-y-1.5">
								<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
									{group.type}
								</p>
								<div className="flex flex-wrap gap-1.5">
									{group.options.map((option) => (
										<button
											type="button"
											aria-pressed={variants[group.type] === option.name}
											key={option.name}
											className={cn(
								"min-h-11 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all",
								variants[group.type] === option.name
													? "border-primary bg-primary text-primary-foreground"
													: "border-border bg-background"
											)}
											onClick={() =>
												setVariants((value) => ({
													...value,
													[group.type]: option.name,
												}))
											}
										>
											{option.name}
											{option.price > 0
												? ` +${currency(option.price)}`
												: ""}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				) : null}
			</div>
			<div className="border-t border-border px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-1.5 py-0.5">
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"
							aria-label="Kurangi jumlah"
							onClick={() => setQuantity((value) => Math.max(1, value - 1))}
						>
							<Minus className="h-3.5 w-3.5" />
						</button>
						<span className="min-w-[1.25rem] text-center text-xs font-black">
							{quantity}
						</span>
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
							aria-label="Tambah jumlah"
							onClick={() => setQuantity((value) => value + 1)}
						>
							<Plus className="h-3.5 w-3.5" />
						</button>
					</div>
					<button
						type="button"
						className="flex min-h-11 flex-1 items-center justify-between rounded-[14px] bg-primary px-3 py-3 text-xs font-black text-primary-foreground shadow-sm"
						onClick={() =>
							onAdd({
								productId: product._id,
								name: product.name,
								price: unitPrice,
								originalPrice: pricing.originalPrice + variantPrice,
								quantity,
								variant:
									Object.values(variants).length > 0
										? Object.values(variants).join(", ")
										: undefined,
								image: product.image,
								categoryId: product.categoryId,
								menuNumber: product.menuNumber,
							})
						}
					>
						<span>Tambah ke keranjang</span>
						<span>{currency(unitPrice * quantity)}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
