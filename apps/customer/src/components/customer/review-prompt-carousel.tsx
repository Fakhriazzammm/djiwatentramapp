import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PackageSearch, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CustomerOrder } from "@/lib/customer-order";
import { useReviewablePurchases, type ReviewablePurchase } from "@/hooks/use-product-reviews";
import { ReviewSheet } from "./review-sheet";

const ROTATE_MS = 6000;
const MAX_DOTS = 8;

function stepIndex(current: number, length: number, direction: 1 | -1 = 1) {
	if (length <= 0) return 0;
	return (((current + direction) % length) + length) % length;
}

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		if (!query) return;
		const update = () => setReduced(query.matches);
		update();
		query.addEventListener?.("change", update);
		return () => query.removeEventListener?.("change", update);
	}, []);
	return reduced;
}

function purchaseDate(ms: number) {
	return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Kartu ajakan ulasan dari riwayat pembelian. Bergeser otomatis seperti kartu
 * Jumat Berkah, urut terbaru → terlama, dan berputar kembali ke terbaru.
 */
export function ReviewPromptCarousel({ orders, className }: { orders: CustomerOrder[]; className?: string }) {
	const { items, snooze, markReviewed } = useReviewablePurchases(orders);
	const reduced = usePrefersReducedMotion();
	const [index, setIndex] = useState(0);
	const [paused, setPaused] = useState(false);
	const [sheet, setSheet] = useState<{ item: ReviewablePurchase; rating: number } | null>(null);

	useEffect(() => { if (index >= items.length) setIndex(0); }, [index, items.length]);
	useEffect(() => {
		if (reduced || paused || sheet || items.length < 2) return;
		const timer = window.setInterval(() => setIndex((value) => stepIndex(value, items.length, 1)), ROTATE_MS);
		return () => window.clearInterval(timer);
	}, [index, items.length, paused, reduced, sheet]);

	if (items.length === 0) return null;
	const current = items[Math.min(index, items.length - 1)];

	const openSheet = (item: ReviewablePurchase, rating: number) => setSheet({ item, rating });
	const handleSubmitted = (item: ReviewablePurchase, result: "submitted" | "duplicate") => {
		markReviewed(item.orderId, item.productId);
		setSheet(null);
		toast.success(result === "duplicate" ? "Menu ini sudah pernah kamu ulas." : "Ulasan terkirim dan menunggu moderasi.");
	};
	const handleSnooze = () => {
		snooze(current.key);
		toast("Kartu ulasan ini disembunyikan selama 7 hari.");
	};

	return (
		<>
			<section
				aria-label="Beri nilai pesananmu"
				className={className}
				onPointerEnter={() => setPaused(true)}
				onPointerLeave={() => setPaused(false)}
				onFocusCapture={() => setPaused(true)}
				onBlurCapture={() => setPaused(false)}
			>
				<div className="flex items-baseline justify-between px-1">
					<h2 className="font-display text-[17px] font-black tracking-tight text-foreground">Beri nilai pesananmu</h2>
					<button
						type="button"
						onClick={handleSnooze}
						className="min-h-9 px-1 text-xs font-bold text-muted-foreground focus-visible:outline-none focus-visible:underline"
					>
						Nanti
					</button>
				</div>

				<div className="mt-1.5 rounded-[20px] bg-card p-3 shadow-[0_0_0_1px_hsl(var(--border)),0_4px_12px_rgba(20,60,110,0.05)]">
					<div className="grid">
						{items.map((item, position) => (
							<div
								key={item.key}
								aria-hidden={position === index ? undefined : true}
								className={cn(
									"col-start-1 row-start-1 flex items-center gap-3 transition-opacity duration-500 motion-reduce:transition-none",
									position === index ? "opacity-100" : "invisible opacity-0",
								)}
							>
								<span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-muted text-muted-foreground">
									{item.image ? (
										<img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
									) : (
										<PackageSearch className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
									)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">Ulasan menu</span>
									<span className="line-clamp-1 block text-[13px] font-black leading-snug text-foreground">{item.productName}</span>
									<span className="block text-[11px] text-muted-foreground">
										Pesanan #{item.orderNumber || item.orderId.slice(0, 8)} · {purchaseDate(item.purchasedAt)}
										{item.quantity > 1 ? ` · ${item.quantity} porsi` : ""}
									</span>
								</span>
							</div>
						))}
					</div>

					<div className="mt-2 flex flex-wrap items-center gap-0.5">
						{[1, 2, 3, 4, 5].map((star) => (
							<button
								key={star}
								type="button"
								aria-label={`Beri ${star} dari 5 bintang untuk ${current.productName}`}
								onClick={() => openSheet(current, star)}
								className="flex h-9 w-9 items-center justify-center rounded-full text-amber-500 transition-transform active:scale-[.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<Star className="h-5 w-5" aria-hidden="true" />
							</button>
						))}
						<span className="ml-1 text-[11px] text-muted-foreground">Ketuk bintang untuk menilai</span>
					</div>

					<div className="mt-2 flex items-center justify-between gap-2">
						<div className="flex items-center gap-0.5" role="group" aria-label="Pilih menu yang diulas">
							<button
								type="button"
								onClick={() => setIndex((value) => stepIndex(value, items.length, -1))}
								disabled={items.length < 2}
								aria-label="Menu sebelumnya"
								className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<div className="flex items-center" aria-hidden="true">
								{items.slice(0, MAX_DOTS).map((item, position) => (
									<span
										key={item.key}
										className={cn("mx-[3px] h-1.5 rounded-full transition-all", position === index % MAX_DOTS ? "w-4 bg-primary" : "w-1.5 bg-foreground/20")}
									/>
								))}
							</div>
							<button
								type="button"
								onClick={() => setIndex((value) => stepIndex(value, items.length, 1))}
								disabled={items.length < 2}
								aria-label="Menu berikutnya"
								className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<ChevronRight className="h-4 w-4" />
							</button>
						</div>
						<button
							type="button"
							onClick={() => openSheet(current, 0)}
							className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-[12.5px] font-extrabold text-primary-foreground shadow-sm transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							Beri ulasan
						</button>
					</div>
				</div>

				<span className="sr-only" aria-live="polite">
					{reduced || paused ? "" : `Ulasan ${index + 1} dari ${items.length}: ${current.productName}`}
				</span>
			</section>

			<ReviewSheet
				item={sheet?.item ?? null}
				initialRating={sheet?.rating ?? 0}
				onClose={() => setSheet(null)}
				onSubmitted={handleSubmitted}
			/>
		</>
	);
}
