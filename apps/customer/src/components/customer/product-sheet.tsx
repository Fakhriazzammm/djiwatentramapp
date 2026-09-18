import { useEffect, useState } from "react";
import { Check, Info, Minus, PackageSearch, Plus, ShoppingCart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import { ImageWithPlaceholder } from "./image-with-placeholder";
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
		discounts,
	);
	const variantPrice = Object.entries(variants).reduce((sum, [groupName, optionName]) => {
		const group = groups.find((entry) => entry.type === groupName);
		const option = group?.options.find((entry) => entry.name === optionName);
		return sum + (option?.price ?? 0);
	}, 0);
	const nutrition = product.nutrition && typeof product.nutrition === "object" && product.nutrition.status !== "rejected"
		? product.nutrition as {
				caloriesKcal: number;
				proteinG: number;
				carbohydratesG: number;
				sugarG?: number | null;
				fatG: number;
				servingSize: string;
				status: "draft" | "reviewed" | "approved";
				notes?: string | null;
		  }
		: null;
	const nutritionIsEstimate = nutrition?.status === "draft";
	const nutritionValues = nutrition && [nutrition.caloriesKcal, nutrition.proteinG, nutrition.carbohydratesG, nutrition.fatG].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
	const unitPrice = pricing.finalPrice + variantPrice;

	return (
		<div className="flex max-h-full min-h-0 flex-col overflow-hidden">
			<div className="flex justify-center bg-muted/90 pb-1.5 pt-2" aria-hidden="true">
				<div className="h-1 w-10 rounded-full bg-foreground/20" />
			</div>
			<div className="relative h-40 shrink-0 bg-muted sm:h-44">
				<ImageWithPlaceholder
					src={product.image ?? undefined}
					alt={product.name}
					containerClassName="absolute inset-0"
					className="object-cover"
					loading="eager"
					decoding="async"
					fallback={<PackageSearch className="h-8 w-8" strokeWidth={1.8} />}
				/>
				<button
					type="button"
					className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
					aria-label="Tutup detail produk"
					onClick={onClose}
				>
					<X className="h-4 w-4" />
				</button>
				{product.menuNumber != null ? (
					<span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
						#{product.menuNumber}
					</span>
				) : null}
				{pricing.isPromo ? <span className="absolute bottom-3 right-3 rounded-full bg-[#2563eb] px-2.5 py-1 text-[11px] font-black text-white shadow">Promo aktif</span> : null}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
				<div className="min-w-0">
					<h3 className="font-display text-xl font-black leading-tight tracking-tight">{product.name}</h3>
						{product.description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{product.description}</p> : null}
						<section className="mt-3 rounded-2xl border border-border/80 bg-muted/25 p-3" aria-labelledby="product-nutrition-title">
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
									<h4 id="product-nutrition-title" className="truncate text-xs font-black">Informasi gizi</h4>
								</div>
								{nutritionIsEstimate ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">Perkiraan</span> : null}
							</div>
							{nutrition && nutritionValues ? (
								<>
									<p className="mt-1 text-[10px] text-muted-foreground">Per porsi · {nutrition.servingSize}</p>
									<div className="mt-2 grid grid-cols-5 gap-1.5">
										{[
											["Kalori", `${nutrition.caloriesKcal} kkal`],
											["Protein", `${nutrition.proteinG} g`],
											["Karbohidrat", `${nutrition.carbohydratesG} g`],
											["Lemak", `${nutrition.fatG} g`],
											["Gula", `${nutrition.sugarG ?? "-"} g`],
										].map(([label, value]) => (
												<div key={label} className="rounded-xl bg-background px-2.5 py-2">
													<p className="text-[11px] text-muted-foreground">{label}</p>
													<p className="mt-0.5 text-xs font-black text-foreground">{value}</p>
												</div>
											))}
									</div>
									{nutrition.notes ? <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{nutrition.notes}</p> : null}
								</>
							) : <p className="mt-2 text-[11px] text-muted-foreground">Informasi gizi belum tersedia.</p>}
						</section>
					</div>

				{groups.length > 0 ? (
					<div className="mt-5 space-y-4">
						{groups.map((group) => (
							<section key={group.type} aria-labelledby={`variant-${group.type}`} className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<h4 id={`variant-${group.type}`} className="text-sm font-black">{group.type}</h4>
									<span className="text-[11px] font-semibold text-muted-foreground">Pilihan</span>
								</div>
								<div className="grid grid-cols-2 gap-2">
									{group.options.map((option) => {
										const isSelected = variants[group.type] === option.name;
										return (
											<button
												type="button"
												aria-pressed={isSelected}
												key={option.name}
												className={cn(
													"flex min-h-12 items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-left text-sm font-bold transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
													isSelected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-primary/40",
												)}
												onClick={() => setVariants((value) => ({ ...value, [group.type]: option.name }))}
											>
												<span className="min-w-0 break-words leading-tight">{option.name}</span>
												<span className="flex shrink-0 items-center gap-1 text-xs">
													{option.price > 0 ? `+${currency(option.price)}` : "Gratis"}
													{isSelected ? <Check className="h-4 w-4" /> : null}
												</span>
											</button>
										);
									})}
								</div>
							</section>
						))}
					</div>
				) : null}
			</div>

			<footer className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
				<div className="flex items-center gap-2.5">
					<div className="min-w-0 flex-1">
						<p className="text-xl font-black leading-none text-primary" aria-live="polite">{currency(unitPrice)}</p>
						{pricing.isPromo ? <p className="mt-1 text-xs font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice + variantPrice)}</p> : null}
					</div>
					<div className="flex h-12 shrink-0 items-center gap-1 rounded-[14px] border border-border bg-background p-1">
						<button type="button" className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-muted transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Kurangi jumlah" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
							<Minus className="h-4 w-4" />
						</button>
						<span className="min-w-7 text-center text-sm font-black" aria-live="polite">{quantity}</span>
						<button type="button" className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-primary-foreground transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Tambah jumlah" onClick={() => setQuantity((value) => value + 1)}>
							<Plus className="h-4 w-4" />
						</button>
					</div>
					<button
						type="button"
						className="flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
						onClick={() => onAdd({
							productId: product._id,
							name: product.name,
							price: unitPrice,
							originalPrice: pricing.originalPrice + variantPrice,
							quantity,
							variant: Object.values(variants).length > 0 ? Object.values(variants).join(", ") : undefined,
							image: product.image,
							categoryId: product.categoryId,
							menuNumber: product.menuNumber,
						})}
					>
						<ShoppingCart className="h-4 w-4" aria-hidden="true" />
						<span>Tambah</span>
					</button>
				</div>
			</footer>
		</div>
	);
}
