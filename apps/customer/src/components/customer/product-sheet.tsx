import { useEffect, useMemo, useState } from "react";
import { Check, Flag, Info, Minus, PackageSearch, Plus, ShoppingCart, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import {
	calculateProductVariationPrice,
	getProductVariationGroupKey,
	type ProductVariationGroup,
} from "@/lib/product-variations";
import { ImageWithPlaceholder } from "./image-with-placeholder";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem } from "./types";
import { currency } from "./types";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useCreateProductReview, useProductReviews } from "@/hooks/use-product-reviews";
import { reportProductReview } from "@/lib/product-reviews";
import { toast } from "sonner";

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
	const { isAuthenticated } = useCustomerAuth();
	const { orders: customerOrders } = useCustomerOrders();
	const productSourceId = product ? String(product._id) : null;
	const reviewList = useProductReviews(productSourceId);
	const reviewSubmission = useCreateProductReview();
	const [reviewRating, setReviewRating] = useState(5);
	const [reviewComment, setReviewComment] = useState("");
	const [reviewOrderId, setReviewOrderId] = useState("");
	const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);
	const [reportConfirmationId, setReportConfirmationId] = useState<string | null>(null);
	const [reportedReviewIds, setReportedReviewIds] = useState<string[]>([]);
	const eligibleOrders = useMemo(() => customerOrders
		.filter((order) => ["paid", "completed", "settled"].includes(String(order.status).toLowerCase()))
		.filter((order) => order.items.some((item) => String(item.productId) === productSourceId && Number(item.quantity) > 0 && !["cancelled", "canceled"].includes(String(item.status ?? "").toLowerCase())))
		.sort((a, b) => b.createdAt - a.createdAt), [customerOrders, productSourceId]);
	useEffect(() => {
		setReviewRating(5);
		setReviewComment("");
		setReviewOrderId("");
		setReviewFeedback(null);
		setReportConfirmationId(null);
		setReportedReviewIds([]);
		if (productSourceId) void reviewList.load();
	}, [productSourceId]);
	useEffect(() => {
		if (eligibleOrders.length && !eligibleOrders.some((order) => order.id === reviewOrderId)) setReviewOrderId(eligibleOrders[0].id);
	}, [eligibleOrders, reviewOrderId]);
	const submitReview = async () => {
		if (!productSourceId || !reviewOrderId || !isAuthenticated) return;
		try {
			await reviewSubmission.submit({ productSourceId, orderSourceId: reviewOrderId, rating: reviewRating, comment: reviewComment });
			setReviewFeedback("Ulasan terkirim dan menunggu moderasi sebelum tampil untuk publik.");
			setReviewComment("");
			toast.success("Ulasan terkirim untuk ditinjau.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Ulasan belum berhasil dikirim.");
		}
	};
	const reportReview = async (reviewId: string) => {
		if (reportConfirmationId !== reviewId) { setReportConfirmationId(reviewId); return; }
		try {
			await reportProductReview(reviewId);
			setReportedReviewIds((current) => [...current, reviewId]);
			setReportConfirmationId(null);
			toast.success("Ulasan dilaporkan untuk ditinjau.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Ulasan belum berhasil dilaporkan.");
		}
	};
	useEffect(() => {
		setQuantity(1);
		setVariants({});
	}, [product]);
	if (!product) return null;

	const groups = Array.isArray(product.variations)
		? (product.variations as ProductVariationGroup[])
		: [];
	const pricing = calculateEffectivePrice(
		{ _id: product._id, price: product.price, categoryId: product.categoryId },
		discounts,
	);
	const variantPrice = calculateProductVariationPrice(groups, variants);
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
	const productImage = String((product as any).image ?? (product as any).imageUrl ?? (product as any).image_url ?? "").trim() || undefined;

	return (
		<div className="flex max-h-full min-h-0 flex-col overflow-hidden">
			<div className="flex justify-center bg-muted/90 pb-1.5 pt-2" aria-hidden="true">
				<div className="h-1 w-10 rounded-full bg-foreground/20" />
			</div>
			<div className="relative h-24 shrink-0 bg-muted sm:h-28">
				<ImageWithPlaceholder
					src={productImage}
					alt={product.name}
					containerClassName="absolute inset-0"
					className="object-cover"
					loading="eager"
					decoding="async"
					fallback={<PackageSearch className="h-8 w-8" strokeWidth={1.8} />}
				/>
				<button
					type="button"
					className="absolute right-3 top-3 z-20 flex h-11 w-11 pointer-events-auto items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
					aria-label="Tutup detail produk"
					onPointerDown={(event) => { event.stopPropagation(); onClose(); }}
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

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 overscroll-contain">
				<div className="min-w-0">
					<h3 className="font-display text-lg font-black leading-tight tracking-tight">{product.name}</h3>
						{product.description ? <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{product.description}</p> : null}
						<section className="mt-2 rounded-xl border border-border/70 bg-muted/20 px-2.5 py-2" aria-labelledby="product-nutrition-title">
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
									<h4 id="product-nutrition-title" className="truncate text-xs font-black">Informasi gizi</h4>
								</div>
								{nutritionIsEstimate ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">Perkiraan</span> : null}
							</div>
							{nutrition && nutritionValues ? (
								<>
									<p className="mt-0.5 text-[10px] text-muted-foreground">Per porsi · {nutrition.servingSize}</p>
									<div className="mt-1.5 grid grid-cols-5 gap-1">
										{[
											["Kalori", `${nutrition.caloriesKcal} kkal`],
											["Protein", `${nutrition.proteinG} g`],
											["Karbohidrat", `${nutrition.carbohydratesG} g`],
											["Lemak", `${nutrition.fatG} g`],
											["Gula", `${nutrition.sugarG ?? "-"} g`],
										].map(([label, value]) => (
												<div key={label} className="rounded-lg bg-background px-1.5 py-1.5">
													<p className="text-[9px] leading-tight text-muted-foreground">{label}</p>
													<p className="mt-0.5 text-[11px] font-black leading-tight text-foreground">{value}</p>
												</div>
											))}
									</div>
									{nutrition.notes ? <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{nutrition.notes}</p> : null}
								</>
							) : <p className="mt-2 text-[11px] text-muted-foreground">Informasi gizi belum tersedia.</p>}
						</section>
					</div>

				{groups.length > 0 ? (
					<div className="mt-3 space-y-3">
						{groups.map((group, groupIndex) => {
							const groupKey = getProductVariationGroupKey(group, groupIndex);
							const groupLabel = group.name?.trim() || group.type?.trim() || `Pilihan ${groupIndex + 1}`;
							const headingId = `variant-${groupIndex}`;
							return (
							<section key={groupKey} aria-labelledby={headingId} className="space-y-1.5">
								<div className="flex items-center justify-between gap-2">
									<h4 id={headingId} className="text-sm font-black">{groupLabel}</h4>
									<span className="text-[11px] font-semibold text-muted-foreground">Pilihan</span>
								</div>
								<div className="grid grid-cols-2 gap-1.5">
									{group.options.map((option) => {
										const isSelected = variants[groupKey] === option.name;
										return (
											<button
												type="button"
												aria-pressed={isSelected}
												key={option.name}
												className={cn(
													"flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-bold transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
													isSelected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-primary/40",
												)}
												onClick={() => setVariants((value) => ({ ...value, [groupKey]: option.name }))}
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
							);
						})}
					</div>
				) : null}
			<details className="mt-3 rounded-xl border border-border/70 bg-muted/15">
				<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-black [&::-webkit-details-marker]:hidden">
					<span>Ulasan customer</span><span className="text-[11px] font-semibold text-muted-foreground">{reviewList.reviews.length ? `${reviewList.reviews.length} ulasan` : "Lihat ulasan"}</span>
				</summary>
				<section className="border-t border-border/60 px-3 py-3" aria-labelledby="product-reviews-title">
				<div className="flex items-start justify-between gap-3">
					<div><h4 id="product-reviews-title" className="text-sm font-black">Ulasan customer</h4><p className="mt-0.5 text-[11px] text-muted-foreground">Pembelian terverifikasi · ulasan baru ditinjau sebelum dipublikasikan</p></div>
					<button type="button" className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-xs font-bold" onClick={() => void reviewList.load(true)} disabled={reviewList.isLoading}>Muat ulang</button>
				</div>
				{reviewList.error ? <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">Ulasan belum dapat dimuat. Coba muat ulang.</p> : null}
				<div className="mt-3 space-y-2">
					{reviewList.reviews.filter((review) => !reportedReviewIds.includes(review.id)).map((review) => <article key={review.id} className="rounded-xl border border-border/80 bg-card p-3">
						<div className="flex items-center justify-between gap-2"><div className="flex items-center gap-0.5" aria-label={`Rating ${review.rating} dari 5`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={value <= review.rating ? "h-3.5 w-3.5 text-amber-500" : "h-3.5 w-3.5 text-muted-foreground/30"} fill={value <= review.rating ? "currentColor" : "none"} />)}</div><span className="text-[10px] text-muted-foreground">{review.createdAt ? new Date(review.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : ""}</span></div>
						<p className="mt-1 text-xs font-bold">{review.customerDisplayName || "Customer"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{review.comment || "Rating tanpa komentar."}</p>
						{isAuthenticated ? <div className="mt-2 flex justify-end gap-2">{reportConfirmationId === review.id ? <><button type="button" className="min-h-11 rounded-lg px-3 text-xs font-semibold text-muted-foreground" onClick={() => setReportConfirmationId(null)}>Batal</button><button type="button" className="min-h-11 rounded-lg bg-rose-50 px-3 text-xs font-bold text-rose-700" onClick={() => void reportReview(review.id)}><Flag className="mr-1 inline h-3.5 w-3.5" />Konfirmasi laporan</button></> : <button type="button" className="min-h-11 rounded-lg px-3 text-xs font-semibold text-muted-foreground" onClick={() => void reportReview(review.id)}><Flag className="mr-1 inline h-3.5 w-3.5" />Laporkan</button>}</div> : null}
					</article>)}
					{!reviewList.isLoading && reviewList.reviews.length === 0 ? <p className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">Belum ada ulasan publik untuk menu ini.</p> : null}
					{reviewList.isLoading && reviewList.reviews.length === 0 ? <p className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">Memuat ulasan…</p> : null}
				</div>
				{reviewList.hasMore ? <button type="button" className="mt-2 min-h-11 w-full rounded-xl border border-border text-xs font-bold" onClick={() => void reviewList.load()} disabled={reviewList.isLoading}>{reviewList.isLoading ? "Memuat…" : "Muat ulasan lainnya"}</button> : null}
				<div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.035] p-3">
					<h5 className="text-xs font-black">Tulis ulasan</h5>
					{!isAuthenticated ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk sebagai customer untuk menulis ulasan berdasarkan pesananmu.</p> : eligibleOrders.length === 0 ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Ulasan tersedia setelah menu ini ada pada pesananmu yang sudah lunas atau selesai.</p> : <div className="mt-2 space-y-2">
						<label className="block text-[11px] font-semibold" htmlFor="review-order-select">Pesanan terverifikasi</label><select id="review-order-select" value={reviewOrderId} onChange={(event) => setReviewOrderId(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs"><option value="" disabled>Pilih pesanan</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber || order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</option>)}</select>
						<div className="flex items-center gap-1" role="group" aria-label="Pilih rating dari 1 sampai 5">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${value} dari 5`} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)}><Star className={value <= reviewRating ? "h-5 w-5 text-amber-500" : "h-5 w-5 text-muted-foreground/40"} fill={value <= reviewRating ? "currentColor" : "none"} /></button>)}</div>
						<label className="sr-only" htmlFor="product-review-comment">Komentar ulasan</label><textarea id="product-review-comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Bagikan pengalamanmu (opsional)" className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-xs outline-none focus:border-primary" /><p className="text-right text-[10px] text-muted-foreground">{reviewComment.length}/500</p>
						<button type="button" className="min-h-11 w-full rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void submitReview()} disabled={!reviewOrderId || reviewSubmission.isSaving}>{reviewSubmission.isSaving ? "Mengirim…" : "Kirim ulasan"}</button>
					</div>}
					{reviewFeedback ? <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" role="status">{reviewFeedback}</p> : null}
				</div>
				</section>
			</details>
			</div>

			<footer className="shrink-0 border-t border-border bg-background px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
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
