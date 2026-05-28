import { useCallback } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import type { MenuStockItem, MenuStockIngredient } from "@/types/menu-stock";

export interface MenuStockDataResult {
  items: MenuStockItem[];
  refreshedAt: number;
}

export function useMenuStockData() {
  const load = useCallback(async (): Promise<MenuStockDataResult | null> => {
    const supabase = createClient();

    // 1. Fetch semua recipe (tanpa variant — resep default per produk)
    const { data: recipes, error: recipeError } = await supabase
      .from("pos_recipes")
      .select("_id, productId, variantName, ingredients")
      .is("variantName", null);

    if (recipeError) throw recipeError;

    const recipeMap = new Map<string, any>();
    for (const r of recipes ?? []) {
      recipeMap.set(r.productId, r);
    }

    // 2. Fetch semua produk
    const { data: products, error: productError } = await supabase
      .from("pos_products_all")
      .select("*");

    if (productError) throw productError;

    // 3. Fetch semua inventory
    const { data: inventory, error: invError } = await supabase
      .from("pos_inventory")
      .select("*");

    if (invError) throw invError;

    const invMap = new Map<string, any>();
    for (const i of inventory ?? []) {
      invMap.set(i._id, i);
    }

    // 4. Fetch categories
    const { data: categories } = await supabase
      .from("pos_categories")
      .select("_id, name");

    const catMap = new Map<string, string>();
    for (const c of categories ?? []) {
      catMap.set(c._id, c.name ?? "");
    }

    // 5. Build menu stock items
    const items: MenuStockItem[] = [];

    for (const p of products ?? []) {
      const recipe = recipeMap.get(p._id);
      if (!recipe) continue; // skip produk tanpa recipe

      const ingredients: MenuStockIngredient[] = [];
      let minMaxPortions = Number.POSITIVE_INFINITY;

      for (const ing of recipe.ingredients ?? []) {
        const inv = invMap.get(ing.inventoryId);
        if (!inv) continue;

        const currentStock = Number(inv.quantity ?? 0);
        const amount = Number(ing.amount ?? 0);
        const maxPortions = amount > 0 ? Math.floor(currentStock / amount) : 999;
        const isLow = currentStock <= Number(inv.lowStockThreshold ?? 0);

        if (maxPortions < minMaxPortions) {
          minMaxPortions = maxPortions;
        }

        ingredients.push({
          inventoryId: ing.inventoryId,
          ingredientName: inv.ingredientName ?? inv.ingredient_name ?? "?",
          amount,
          currentStock,
          unit: inv.unit ?? "",
          maxPortions,
          isLow,
        });
      }

      items.push({
        productId: p._id,
        productName: p.name ?? "",
        categoryName: catMap.get(p.categoryId ?? p.category_source_id) ?? "Lainnya",
        currentStock: Number(p.quantity ?? 0),
        unit: "porsi",
        recipeId: recipe._id ?? null,
        ingredientCount: ingredients.length,
        ingredients,
        isAvailable: Boolean(p.isAvailable ?? p.is_available),
        price: Number(p.price ?? 0),
        image: p.image ?? null,
        menuNumber: p.menuNumber ?? p.menu_number ?? null,
      });
    }

    // Sort: lowest stock first, then by category, then name
    items.sort((a, b) => {
      if (a.currentStock !== b.currentStock) {
        return a.currentStock - b.currentStock;
      }
      if (a.categoryName !== b.categoryName) {
        return a.categoryName.localeCompare(b.categoryName, "id-ID");
      }
      return a.productName.localeCompare(b.productName, "id-ID");
    });

    return { items, refreshedAt: Date.now() };
  }, []);

  return useSupabaseLiveValue<MenuStockDataResult | null>(
    "menu-stock-data:v1",
    load,
    []
  );
}

/**
 * Kalkulasi preview: "jika menu diset X porsi, berapa bahan baku yang dibutuhkan"
 * Pure function — tidak fetch data, menerima data yang sudah ada.
 */
export function calculateStockRecipePreview(
  ingredients: MenuStockIngredient[],
  targetStock: number
) {
  return ingredients.map((ing) => {
    const totalNeeded = ing.amount * targetStock;
    return {
      inventoryId: ing.inventoryId,
      ingredientName: ing.ingredientName,
      amountPerPortion: ing.amount,
      totalNeeded,
      currentStock: ing.currentStock,
      unit: ing.unit,
      isSufficient: ing.currentStock >= totalNeeded,
      shortage: Math.max(0, totalNeeded - ing.currentStock),
    };
  });
}
