import { useEffect, useState } from "react";
import { Check, PackageSearch, Plus, X } from "lucide-react";
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
  const [addedRecommendationIds, setAddedRecommendationIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setAddedRecommendationIds(new Set());
  }, [mainItem?.productId]);

  if (!open || !mainItem || recommendations.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{addedLabel}</p>
          <h3 className="mt-1 truncate font-display text-lg font-black">{mainItem.name}</h3>
          <p className="mt-0.5 text-sm font-semibold text-muted-foreground">{currency(mainItem.price * mainItem.quantity)}</p>
        </div>
        <button
          type="button"
          aria-label={skipLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
            const isAdded = addedRecommendationIds.has(recommendation.recommendedProductSourceId);
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
              <article key={recommendation.recommendedProductSourceId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {recommendation.recommendedImage ? <img src={recommendation.recommendedImage} alt={recommendation.recommendedName} className="h-full w-full object-cover" loading="lazy" /> : <PackageSearch aria-hidden="true" className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-black leading-tight">{recommendation.recommendedName}</p>
                  {recommendation.recommendedDescription ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{recommendation.recommendedDescription}</p> : null}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm font-black text-primary">{currency(pricing.finalPrice)}</span>
                    {pricing.isPromo ? <span className="text-[11px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isAdded}
                  aria-label={isAdded ? addedLabel : recommendation.ctaLabel ?? undefined}
                  className={cn(
                    "flex min-h-11 max-w-[5.5rem] shrink-0 items-center justify-center gap-1 rounded-[14px] px-3 py-2 text-center text-xs font-black leading-tight transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default",
                    isAdded
                      ? "bg-emerald-50 text-emerald-700"
                      : canAddDirectly
                        ? "bg-primary text-primary-foreground"
                        : "border border-primary/25 bg-primary/5 text-primary",
                  )}
                  onClick={() => {
                    if (isAdded) return;
                    if (canAddDirectly) {
                      onAdd(recommendation, item);
                      setAddedRecommendationIds((current) => new Set(current).add(recommendation.recommendedProductSourceId));
                    } else {
                      onChooseOptions(recommendation);
                    }
                  }}
                >
                  {isAdded ? <Check className="h-3.5 w-3.5 shrink-0" /> : canAddDirectly ? <Plus className="h-3.5 w-3.5 shrink-0" /> : null}
                  {isAdded ? addedLabel : recommendation.ctaLabel}
                </button>
              </article>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-background px-3 py-3 text-sm font-black transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={onClose}
        >
          {skipLabel}
        </button>
      </footer>
    </div>
  );
}
