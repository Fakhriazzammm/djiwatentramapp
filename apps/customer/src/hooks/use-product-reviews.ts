import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import type { CustomerOrder } from "@/lib/customer-order";
import { createProductReview, getProductReviewSummary, listMyProductReviews, listProductReviews, type CreateProductReviewInput, type ProductReview, type ProductReviewSummary } from "@/lib/product-reviews";

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

// ── Ajakan ulasan dari riwayat pembelian ────────────────────────

export type ReviewablePurchase = {
  key: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  image: string | null;
  quantity: number;
  purchasedAt: number;
};

const REVIEWABLE_ORDER_STATUSES = new Set(["paid", "completed", "settled"]);
const CANCELLED_ITEM_STATUSES = new Set(["cancelled", "canceled"]);
const REVIEW_SNOOZE_KEY = "djiwa-review-prompt-snooze";
const REVIEW_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REVIEWABLE = 20;

function reviewPairKey(orderId: string, productId: string) {
  return `${orderId}::${productId}`;
}

function readSnoozes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(REVIEW_SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const expiresAt = Number(value);
      if (Number.isFinite(expiresAt) && expiresAt > now) next[key] = expiresAt;
    }
    return next;
  } catch {
    return {};
  }
}

/**
 * Menu dari pesanan yang sudah selesai/lunas dan belum diulas, terbaru → terlama.
 * Menyembunyikan item yang di-"Nanti"-kan selama 7 hari. Kosong bila daftar
 * ulasan milik customer gagal dimuat (fail closed, agar tidak memicu duplikat).
 */
export function useReviewablePurchases(orders: CustomerOrder[]) {
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const [reviewedPairs, setReviewedPairs] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozes, setSnoozes] = useState<Record<string, number>>(() => readSnoozes());
  const sourceId = customer?.sourceId ?? null;

  useEffect(() => {
    if (!isAuthenticated || !sourceId) {
      setReviewedPairs(new Set());
      setError(null);
      return;
    }
    let cancelled = false;
    setReviewedPairs(null);
    setError(null);
    void listMyProductReviews()
      .then((rows) => {
        if (cancelled) return;
        setReviewedPairs(new Set(rows.map((row) => reviewPairKey(row.orderSourceId, row.productSourceId))));
      })
      .catch((cause) => {
        if (cancelled) return;
        setReviewedPairs(null);
        setError(cause instanceof Error ? cause.message : "Daftar ulasan belum dapat dimuat");
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, sourceId]);

  const items = useMemo<ReviewablePurchase[]>(() => {
    if (!isAuthenticated || !reviewedPairs) return [];
    const now = Date.now();
    const seen = new Set<string>();
    const list: ReviewablePurchase[] = [];
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    for (const order of sorted) {
      if (!REVIEWABLE_ORDER_STATUSES.has(String(order.status ?? "").toLowerCase())) continue;
      for (const item of order.items) {
        const productId = String(item.productId ?? "");
        if (!productId) continue;
        if (item.status && CANCELLED_ITEM_STATUSES.has(String(item.status).toLowerCase())) continue;
        const key = reviewPairKey(order.id, productId);
        if (seen.has(key) || reviewedPairs.has(key)) continue;
        const snoozedUntil = snoozes[key];
        if (snoozedUntil && snoozedUntil > now) continue;
        seen.add(key);
        list.push({
          key,
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId,
          productName: item.productName || "Menu",
          image: item.image ?? null,
          quantity: Math.max(1, Number(item.quantity) || 1),
          purchasedAt: order.createdAt,
        });
        if (list.length >= MAX_REVIEWABLE) return list;
      }
    }
    return list;
  }, [isAuthenticated, orders, reviewedPairs, snoozes]);

  const snooze = useCallback((key: string) => {
    setSnoozes((current) => {
      const next = { ...current, [key]: Date.now() + REVIEW_SNOOZE_MS };
      try { localStorage.setItem(REVIEW_SNOOZE_KEY, JSON.stringify(next)); } catch { /* storage optional */ }
      return next;
    });
  }, []);

  const markReviewed = useCallback((orderId: string, productId: string) => {
    setReviewedPairs((current) => {
      const next = new Set(current ?? []);
      next.add(reviewPairKey(orderId, productId));
      return next;
    });
  }, []);

  return {
    items,
    isLoading: authLoading || (isAuthenticated && reviewedPairs === null && !error),
    error,
    snooze,
    markReviewed,
  };
}
