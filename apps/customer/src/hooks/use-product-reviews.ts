import { useCallback, useEffect, useRef, useState } from "react";
import { createProductReview, getProductReviewSummary, listProductReviews, type CreateProductReviewInput, type ProductReview, type ProductReviewSummary } from "@/lib/product-reviews";

export function useProductReviewSummary(productSourceId: string | null, enabled = true) {
  const key = enabled ? productSourceId : null;
  const current = useRef(key);
  current.current = key;
  const request = useRef(0);
  const [state, setState] = useState<{ key: string | null; summary: ProductReviewSummary | null; isLoading: boolean; error: string | null }>({ key: null, summary: null, isLoading: false, error: null });
  const refresh = useCallback(async () => {
    const version = ++request.current;
    setState({ key, summary: null, isLoading: Boolean(key), error: null });
    if (!key) return;
    try {
      const summary = await getProductReviewSummary(key);
      if (current.current === key && request.current === version) setState({ key, summary, isLoading: false, error: null });
    } catch (cause) {
      if (current.current === key && request.current === version) setState({ key, summary: null, isLoading: false, error: cause instanceof Error ? cause.message : "Gagal memuat rating" });
    }
  }, [key]);
  useEffect(() => { void refresh(); return () => { ++request.current; }; }, [refresh]);
  return { summary: state.key === key ? state.summary : null, isLoading: state.key === key ? state.isLoading : Boolean(key), error: state.key === key ? state.error : null, refresh };
}

export function useProductReviews(productSourceId: string | null) {
  const current = useRef(productSourceId);
  current.current = productSourceId;
  const request = useRef(0);
  const empty = { reviews: [] as ProductReview[], isLoading: false, error: null as string | null, hasLoaded: false, hasMore: false, nextCursor: null as string | null };
  const [state, setState] = useState({ key: productSourceId, ...empty });
  const visible = state.key === productSourceId ? state : empty;
  const load = useCallback(async (forceRefresh = false) => {
    if (!productSourceId || visible.isLoading || (!forceRefresh && visible.hasLoaded && !visible.hasMore)) return;
    const version = ++request.current;
    const previous = forceRefresh
      ? { key: productSourceId, reviews: [] as ProductReview[], isLoading: false, error: null, hasLoaded: false, hasMore: false, nextCursor: null }
      : visible;
    setState({ key: productSourceId, ...previous, isLoading: true, error: null });
    try {
      const result = await listProductReviews(productSourceId, previous.nextCursor);
      if (current.current === productSourceId && request.current === version) setState({ key: productSourceId, ...result, reviews: [...previous.reviews, ...result.reviews], hasLoaded: true, isLoading: false, error: null });
    } catch (cause) {
      if (current.current === productSourceId && request.current === version) setState({ key: productSourceId, ...previous, isLoading: false, error: cause instanceof Error ? cause.message : "Gagal memuat ulasan" });
    }
  }, [productSourceId, visible]);
  const reset = useCallback(() => { ++request.current; setState({ key: productSourceId, reviews: [], isLoading: false, error: null, hasLoaded: false, hasMore: false, nextCursor: null }); }, [productSourceId]);
  useEffect(() => { reset(); return () => { ++request.current; }; }, [reset]);
  return { ...visible, load, reset };
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
