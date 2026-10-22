import { useCallback, useEffect, useState } from "react";
import { createProductReview, getProductReviewSummary, listProductReviews, type CreateProductReviewInput, type ProductReview, type ProductReviewSummary } from "@/lib/product-reviews";

export function useProductReviewSummary(productSourceId: string | null, enabled = true) {
  const [summary, setSummary] = useState<ProductReviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(productSourceId && enabled));
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!productSourceId || !enabled) return;
    setIsLoading(true); setError(null);
    try { setSummary(await getProductReviewSummary(productSourceId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat rating"); }
    finally { setIsLoading(false); }
  }, [enabled, productSourceId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { summary, isLoading, error, refresh };
}

export function useProductReviews(productSourceId: string | null) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!productSourceId || hasLoaded) return;
    setIsLoading(true); setError(null);
    try { const result = await listProductReviews(productSourceId); setReviews(result.reviews); setHasLoaded(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat ulasan"); }
    finally { setIsLoading(false); }
  }, [hasLoaded, productSourceId]);
  const reset = useCallback(() => { setReviews([]); setHasLoaded(false); setError(null); }, []);
  return { reviews, isLoading, error, hasLoaded, load, reset };
}

export function useCreateProductReview() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(async (input: CreateProductReviewInput) => {
    setIsSaving(true); setError(null);
    try { return await createProductReview(input); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Gagal mengirim ulasan"; setError(message); throw cause; }
    finally { setIsSaving(false); }
  }, []);
  return { submit, isSaving, error };
}
