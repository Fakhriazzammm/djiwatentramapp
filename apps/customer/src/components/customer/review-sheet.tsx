import { PackageSearch, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ProductReviewComposer } from "./product-review-composer";
import type { ReviewablePurchase } from "@/hooks/use-product-reviews";

function purchaseDate(ms: number) {
	return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Bottom sheet rating + komentar untuk satu menu dari riwayat pembelian. */
export function ReviewSheet({
	item,
	initialRating = 0,
	onClose,
	onSubmitted,
}: {
	item: ReviewablePurchase | null;
	initialRating?: number;
	onClose: () => void;
	onSubmitted?: (item: ReviewablePurchase, result: "submitted" | "duplicate") => void;
}) {
	return (
		<Sheet open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				aria-label="Beri ulasan menu"
				className="z-[2000] max-h-[88dvh] gap-0 rounded-t-[26px] border-0 p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
			>
				{item ? (
					<>
						<div className="flex justify-center pb-1.5 pt-2" aria-hidden="true">
							<div className="h-1 w-10 rounded-full bg-foreground/20" />
						</div>
						<div className="flex items-center justify-between gap-2 px-4 pt-1">
							<h2 className="font-display text-base font-black tracking-tight">Beri ulasan</h2>
							<button
								type="button"
								onClick={onClose}
								aria-label="Tutup ulasan"
								className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						<div className="px-4 pb-2">
							<div className="mt-2 flex items-center gap-3 rounded-[18px] bg-muted/40 p-3">
								<span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-muted text-muted-foreground">
									{item.image ? (
										<img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
									) : (
										<PackageSearch className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
									)}
								</span>
								<div className="min-w-0">
									<p className="truncate text-sm font-black leading-snug text-foreground">{item.productName}</p>
									<p className="mt-0.5 text-[11px] text-muted-foreground">
										Pesanan #{item.orderNumber || item.orderId.slice(0, 8)} · {purchaseDate(item.purchasedAt)}
										{item.quantity > 1 ? ` · ${item.quantity} porsi` : ""}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<ProductReviewComposer
									key={`${item.key}:${initialRating}`}
									productSourceId={item.productId}
									orderSourceId={item.orderId}
									initialRating={initialRating}
									onSubmitted={(result) => onSubmitted?.(item, result)}
								/>
							</div>
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
