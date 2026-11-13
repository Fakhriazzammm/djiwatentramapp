import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import { cn } from "@/lib/utils";
import { AnimatedNumber, formatRp, IOS_SPRING, IosSheet, StatusPill } from "./ios-kit";

export interface CartLineInput {
	productId: string;
	name: string;
	price: number;
	originalPrice?: number;
	quantity: number;
	variant?: string;
	image?: string;
	category?: string;
}

/** Pilih varian + jumlah sebelum masuk keranjang. Aturan harga sama dengan sheet lama. */
export function ProductOptionsSheet({ product, activeDiscounts, onClose, onAdd }: { product: any | null; activeDiscounts: any; onClose: () => void; onAdd: (line: CartLineInput) => void }) {
	const [quantity, setQuantity] = useState(1);
	const [selected, setSelected] = useState<Record<string, string>>({});
	const groups = useMemo(
		() =>
			(Array.isArray(product?.variations) ? product.variations : [])
				.map((group: any, index: number) => ({
					key: `variation-${index}`,
					label: String(group?.name ?? group?.type ?? "").trim() || `Pilihan ${index + 1}`,
					options: Array.isArray(group?.options) ? group.options : [],
				}))
				.filter((group: any) => group.options.length > 0),
		[product],
	);
	useEffect(() => {
		if (!product) return;
		setQuantity(1);
		setSelected(Object.fromEntries(groups.flatMap((group: any) => (group.options[0]?.name ? [[group.key, group.options[0].name]] : []))));
	}, [product, groups]);

	const pricing = product ? calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, activeDiscounts, { allowHappyHour: false }) : null;
	const variantPrice = groups.reduce((sum: number, group: any) => sum + (Number(group.options.find((o: any) => o.name === selected[group.key])?.price) || 0), 0);
	const unit = (pricing?.finalPrice ?? 0) + variantPrice;
	const complete = groups.every((group: any) => Boolean(selected[group.key]));
	const variantLabel = groups.map((group: any) => selected[group.key]).filter(Boolean).join(" · ");

	return (
		<IosSheet
			open={Boolean(product)}
			onClose={onClose}
			title={product?.name}
			heightClass="max-h-[82dvh]"
			footer={
				<div className="flex items-center gap-3">
					<div className="flex items-center rounded-full bg-muted">
						<button type="button" aria-label="Kurangi jumlah" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-12 w-11 items-center justify-center disabled:opacity-40"><Minus className="h-4 w-4" /></button>
						<span className="min-w-6 text-center text-[16px] font-extrabold tabular-nums">{quantity}</span>
						<button type="button" aria-label="Tambah jumlah" onClick={() => setQuantity((q) => q + 1)} className="flex h-12 w-11 items-center justify-center"><Plus className="h-4 w-4" /></button>
					</div>
					<motion.button
						type="button"
						whileTap={{ scale: 0.97 }}
						transition={IOS_SPRING}
						disabled={!complete || !product}
						onClick={() => product && pricing && onAdd({ productId: product._id, name: product.name, price: unit, originalPrice: pricing.originalPrice + variantPrice, quantity, variant: variantLabel || undefined, image: product.image, category: product.categoryId })}
						className="h-12 flex-1 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
					>
						Tambah · <AnimatedNumber value={unit * quantity} />
					</motion.button>
				</div>
			}
		>
			{product ? (
				<div className="pb-2">
					{product.description ? <p className="mb-3 line-clamp-2 text-[13px] text-muted-foreground">{product.description}</p> : null}
					<div className="mb-4 flex items-center justify-between rounded-2xl bg-muted/60 px-3.5 py-2.5">
						<span className="flex items-center gap-2">
							{pricing?.isPromo ? <span className="text-[12px] text-muted-foreground line-through">{formatRp(pricing.originalPrice)}</span> : null}
							<span className="text-[17px] font-extrabold tabular-nums">{formatRp(pricing?.finalPrice)}</span>
						</span>
						{pricing?.isPromo && pricing.discountName ? <StatusPill tone="bad">{pricing.discountName}</StatusPill> : null}
					</div>
					{groups.map((group: any) => (
						<fieldset key={group.key} className="mb-4">
							<legend className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">{group.label.toUpperCase()}</legend>
							<div className="flex flex-wrap gap-2">
								{group.options.map((option: any) => {
									const active = selected[group.key] === option.name;
									return (
										<motion.button key={option.name} type="button" whileTap={{ scale: 0.94 }} transition={IOS_SPRING} aria-pressed={active} onClick={() => setSelected((prev) => ({ ...prev, [group.key]: option.name }))} className={cn("rounded-full px-4 py-2.5 text-[13px] font-semibold", active ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(26,93,198,0.28)]" : "bg-muted")}>
											{option.name}
											{Number(option.price) > 0 ? <span className="ml-1.5 opacity-75">+{formatRp(option.price)}</span> : null}
										</motion.button>
									);
								})}
							</div>
						</fieldset>
					))}
				</div>
			) : null}
		</IosSheet>
	);
}
