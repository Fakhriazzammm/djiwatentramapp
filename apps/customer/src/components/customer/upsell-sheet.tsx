import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem } from "./types";
import { currency } from "./types";
import type { ProductUpsellRecommendation } from "@/hooks/use-product-upsells";

export function UpsellSheet({
  open,
  mainItem,
  recommendations,
  discounts,
  title,
  skipLabel,
  addedLabel,
  onClose,
  onAdd,
  onChooseOptions,
}: {
  open: boolean;
  mainItem: CartItem | null;
  recommendations: ProductUpsellRecommendation[];
  discounts: Doc<"discounts">[];
  title: string;
  skipLabel: string;
  addedLabel: string;
  onClose: () => void;
  onAdd: (recommendation: ProductUpsellRecommendation, item: CartItem) => void;
  onChooseOptions: (recommendation: ProductUpsellRecommendation) => void;
}) {
  if (!open || !mainItem || recommendations.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{addedLabel}</p>
          <h3 className="mt-1 truncate font-display text-lg font-black">{mainItem.name}</h3>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{currency(mainItem.price * mainItem.quantity)}</p>
        </div>
        <button type="button" aria-label={skipLabel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h4 className="font-display text-base font-black">{title}</h4>
        <div className="mt-3 space-y-2.5">
          {recommendations.map((recommendation) => {
            const pricing = calculateEffectivePrice(
              {
                _id: recommendation.recommendedProductSourceId,
                price: recommendation.recommendedPrice,
                categoryId: recommendation.recommendedCategoryId,
              },
              discounts,
            );
            const canAddDirectly = !recommendation.requiresOptions;
            const item: CartItem = {
              productId: recommendation.recommendedProductSourceId as Id<"products">,
              name: recommendation.recommendedName,
              price: pricing.finalPrice,
              originalPrice: pricing.originalPrice,
              quantity: 1,
              image: recommendation.recommendedImage ?? undefined,
              categoryId: recommendation.recommendedCategoryId as Id<"categories">,
            };
            return (
              <div key={recommendation.recommendedProductSourceId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {recommendation.recommendedImage ? <img src={recommendation.recommendedImage} alt={recommendation.recommendedName} className="h-full w-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-black">{recommendation.recommendedName}</p>
                  {recommendation.recommendedDescription ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{recommendation.recommendedDescription}</p> : null}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-xs font-black text-primary">{currency(pricing.finalPrice)}</span>
                    {pricing.isPromo ? <span className="text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={cn("flex min-h-11 shrink-0 items-center gap-1 rounded-[14px] px-3 py-2 text-xs font-black", canAddDirectly ? "bg-primary text-primary-foreground" : "border border-primary/25 bg-primary/5 text-primary")}
                  onClick={() => canAddDirectly ? onAdd(recommendation, item) : onChooseOptions(recommendation)}
                >
                  {canAddDirectly ? <Plus className="h-3.5 w-3.5" /> : null}
                  {recommendation.ctaLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-background px-3 py-3 text-sm font-black" onClick={onClose}>
          <Check className="h-4 w-4" />
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
