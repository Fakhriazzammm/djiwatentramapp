import { useMemo } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

export type ProductUpsellRecommendation = {
  productSourceId: string;
  recommendedProductSourceId: string;
  sortOrder: number;
  titleOverride?: string | null;
  descriptionOverride?: string | null;
  ctaLabel?: string | null;
  maxQuantity?: number | null;
  requiresOptions: boolean;
  recommendedName: string;
  recommendedDescription?: string | null;
  recommendedImage?: string | null;
  recommendedPrice: number;
  recommendedPromoPrice?: number | null;
  recommendedCategoryId: string;
  recommendedVariations: unknown;
};

async function fetchProductUpsells(productSourceId: string) {
  if (!productSourceId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_product_upsell_recommendations")
    .select("*")
    .eq("product_source_id", productSourceId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    productSourceId: String(row.product_source_id ?? ""),
    recommendedProductSourceId: String(row.recommended_product_source_id ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    titleOverride: row.title_override ?? null,
    descriptionOverride: row.description_override ?? null,
    ctaLabel: row.cta_label ?? null,
    maxQuantity: row.max_quantity == null ? null : Number(row.max_quantity),
    requiresOptions: Boolean(row.requires_options),
    recommendedName: String(row.recommended_name ?? ""),
    recommendedDescription: row.recommended_description ?? null,
    recommendedImage: row.recommended_image ?? null,
    recommendedPrice: Number(row.recommended_price ?? 0),
    recommendedPromoPrice: row.recommended_promo_price == null ? null : Number(row.recommended_promo_price),
    recommendedCategoryId: String(row.recommended_category_id ?? ""),
    recommendedVariations: row.recommended_variations,
  })) as ProductUpsellRecommendation[];
}

export function useProductUpsellRecommendations(productSourceId?: string | null, refreshTrigger?: number) {
  const data = useSupabaseLiveValue(
    `product-upsells:${productSourceId ?? "none"}`,
    () => fetchProductUpsells(productSourceId ?? ""),
    [productSourceId],
    {
      cacheKey: productSourceId ? `customer:product-upsells:${productSourceId}` : undefined,
      cacheTtlMs: 300_000,
      refreshTrigger,
    },
  );

  return useMemo(() => {
    if (!productSourceId) return [];
    return data;
  }, [data, productSourceId]);
}
