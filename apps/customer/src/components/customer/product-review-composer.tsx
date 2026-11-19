import { useState } from "react";
import { Star } from "lucide-react";
import { useCreateProductReview } from "@/hooks/use-product-reviews";

/**
 * Form rating + komentar untuk satu menu dalam satu pesanan.
 * Dipakai di bottom sheet menu dan di kartu ajakan ulasan.
 */
export function ProductReviewComposer({
	productSourceId,
	orderSourceId,
	initialRating = 0,
	onSubmitted,
}: {
	productSourceId: string;
	orderSourceId: string;
	initialRating?: number;
	onSubmitted?: (result: "submitted" | "duplicate") => void;
}) {
	const reviewCreate = useCreateProductReview();
	const [selectedRating, setSelectedRating] = useState(initialRating);
	const [reviewComment, setReviewComment] = useState("");
	const [result, setResult] = useState<"submitted" | "duplicate" | null>(null);

	const submitReview = async () => {
		if (selectedRating < 1 || reviewCreate.isSaving) return;
		try {
			await reviewCreate.submit({ productSourceId, orderSourceId, rating: selectedRating, comment: reviewComment });
			setResult("submitted");
			setSelectedRating(0);
			setReviewComment("");
			onSubmitted?.("submitted");
		} catch (cause) {
			const code = (cause as { code?: string } | null)?.code;
			const message = cause instanceof Error ? cause.message : "";
			if (code === "DUPLICATE_REVIEW" || /sudah pernah diulas/i.test(message)) {
				setResult("duplicate");
				onSubmitted?.("duplicate");
			}
			// Error lain tetap tampil inline lewat reviewCreate.error agar bisa dicoba lagi.
		}
	};

	if (result) {
		return (
			<div role="status" className="rounded-[14px] bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
				{result === "duplicate" ? "Menu ini sudah pernah kamu ulas. Terima kasih!" : "Ulasan terkirim dan menunggu moderasi. Terima kasih sudah berbagi."}
			</div>
		);
	}

	return (
		<>
			<p className="text-xs font-black">Beri rating</p>
			<div className="mt-1 flex gap-1" role="radiogroup" aria-label="Pilih rating menu">
				{[1, 2, 3, 4, 5].map((star) => (
					<button
						key={star}
						type="button"
						role="radio"
						aria-checked={selectedRating === star}
						aria-label={`${star} dari 5 bintang`}
						className="flex h-11 w-11 items-center justify-center rounded-[14px] text-amber-500 transition-transform active:scale-[.97] hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						onClick={() => setSelectedRating(star)}
					>
						<Star className="h-6 w-6" fill={star <= selectedRating ? "currentColor" : "none"} />
					</button>
				))}
			</div>
			<textarea
				value={reviewComment}
				maxLength={500}
				onChange={(event) => setReviewComment(event.target.value)}
				rows={3}
				placeholder="Ceritakan pengalamanmu (opsional)"
				className="mt-2 w-full resize-none rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
				aria-label="Komentar ulasan"
			/>
			<div className="mt-1 flex items-center justify-between gap-2">
				<span className="text-[10px] text-muted-foreground">{reviewComment.length}/500</span>
				<button
					type="button"
					disabled={selectedRating < 1 || reviewCreate.isSaving}
					className="min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground transition-transform active:scale-[.97] disabled:pointer-events-none disabled:opacity-50"
					onClick={() => void submitReview()}
				>
					{reviewCreate.isSaving ? "Mengirim..." : "Kirim ulasan"}
				</button>
			</div>
			{reviewCreate.error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{reviewCreate.error}</p> : null}
		</>
	);
}
