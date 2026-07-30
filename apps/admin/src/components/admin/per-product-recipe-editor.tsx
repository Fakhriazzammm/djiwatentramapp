// @ts-nocheck
import { Plus, Trash2, Calculator, ExternalLink, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSmallestUnitLabel } from "@/lib/inventory-units";

// ── Types ─────────────────────────────────────────────────────────

type IngredientRow = {
  inventoryId: string;
  amount: number;
};

type ProductItem = {
  _id: string;
  name: string;
  price?: number;
  categoryId?: string;
};

type InventoryItem = {
  _id: string;
  ingredientName: string;
  unit: string;
  displayUnit?: string | null;
  conversionFactor?: number | null;
  unitConversions?: Array<{ unit: string; factor: number }> | null;
  unitConversionsText?: string | null;
};

type RecipeRecord = {
  _id: string;
  productId: string;
  variantName?: string | null;
  ingredients: Array<{ inventoryId: string; amount: number }>;
  steps?: unknown[] | null;
};

// ── Props ─────────────────────────────────────────────────────────

export default function PerProductRecipeEditor({
  product,
  recipe,
  inventory,
  latestCosts,
  baseRecipes,
  onSave,
  onNavigateToHpp,
  onNavigateToProduct,
}: {
  product: ProductItem | null;
  recipe: RecipeRecord | null | undefined;
  inventory: InventoryItem[];
  latestCosts?: Record<string, { latestCostPerUnit?: number }> | null;
  baseRecipes?: Array<{ _id: string; name: string }> | null;
  onSave: (ingredients: { inventoryId: string; amount: number }[]) => Promise<void>;
  onNavigateToHpp?: () => void;
  onNavigateToProduct?: () => void;
}) {
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [ingredientQuery, setIngredientQuery] = useState("");

  // ── Init from recipe when it changes ───────────────────────────

  useEffect(() => {
    if (recipe?.ingredients) {
      setIngredients(
        recipe.ingredients.map((ing) => ({
          inventoryId: String(ing.inventoryId),
          amount: ing.amount,
        }))
      );
    } else {
      setIngredients([]);
    }
  }, [recipe]);

  // ── Derive ──────────────────────────────────────────────────────

  const inventoryMap = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of inventory ?? []) {
      map.set(String(item._id), item);
    }
    return map;
  }, [inventory]);

  const sortedInventory = useMemo(
    () =>
      [...(inventory ?? [])].sort((a, b) =>
        (a.ingredientName ?? "").localeCompare(b.ingredientName ?? "", "id")
      ),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    const keyword = ingredientQuery.trim().toLowerCase();
    if (!keyword) return sortedInventory;
    return sortedInventory.filter((item) =>
      (item.ingredientName ?? "").toLowerCase().includes(keyword)
    );
  }, [ingredientQuery, sortedInventory]);

  const selectedInventoryIds = useMemo(
    () => new Set(ingredients.map((ing) => ing.inventoryId)),
    [ingredients]
  );

  const isValid = ingredients.length > 0 && ingredients.every((ing) => ing.amount > 0 && ing.inventoryId);

  // ── Handlers ────────────────────────────────────────────────────

  const addIngredient = (inventoryId: string) => {
    if (!inventoryId) return;
    if (selectedInventoryIds.has(inventoryId)) {
      toast.error("Bahan sudah ditambahkan");
      return;
    }
    setIngredients((prev) => [...prev, { inventoryId, amount: 0 }]);
    setIngredientQuery("");
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAmount = (index: number, amount: number) => {
    setIngredients((prev) =>
      prev.map((item, i) => (i === index ? { ...item, amount } : item))
    );
  };

  const handleSave = async () => {
    if (!product) return;
    if (!isValid) {
      toast.error("Pastikan semua bahan memiliki jumlah > 0");
      return;
    }
    setSaving(true);
    try {
      await onSave(ingredients.map((ing) => ({ inventoryId: ing.inventoryId, amount: ing.amount })));
      toast.success("Resep berhasil disimpan");
    } catch (err: any) {
      toast.error(err?.message ?? "Gagal menyimpan resep");
    } finally {
      setSaving(false);
    }
  };

  // ── Empty State ─────────────────────────────────────────────────

  if (!product) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-[11px] text-muted-foreground">
          Pilih produk untuk mengelola resep
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Header: Product Info + Links */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">{product.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            {product.price != null && product.price > 0
              ? `Rp ${product.price.toLocaleString("id-ID")}`
              : "Harga belum diatur"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onNavigateToHpp && (
            <Button
              onClick={onNavigateToHpp}
              size="xs"
              variant="outline"
              type="button"
              className="text-[10px] gap-1"
            >
              <Calculator className="h-3 w-3" />
              HPP
              <ExternalLink className="h-2.5 w-2.5" />
            </Button>
          )}
          {onNavigateToProduct && (
            <Button
              onClick={onNavigateToProduct}
              size="xs"
              variant="outline"
              type="button"
              className="text-[10px] gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Produk
            </Button>
          )}
        </div>
      </div>

      {/* Add Ingredient Row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            className="h-8 text-[11px]"
            list="pe-ingredient-options"
            placeholder="➕ Tambah bahan (ketik untuk cari)..."
            value={ingredientQuery}
            onChange={(e) => setIngredientQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addIngredient(ingredientQuery.trim());
            }}
          />
          <datalist id="pe-ingredient-options">
            {filteredInventory.map((item) => (
              <option
                key={item._id}
                value={item.ingredientName}
              />
            ))}
          </datalist>
        </div>
        <Button
          onClick={() => addIngredient(ingredientQuery.trim())}
          size="xs"
          variant="outline"
          type="button"
          className="h-8 text-[11px]"
        >
          <Plus className="h-3 w-3" />
          Tambah
        </Button>
      </div>

      {/* Ingredient Table */}
      <div className="space-y-1.5">
        {/* Header */}
        <div className="grid grid-cols-[1fr_90px_50px_28px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Bahan</span>
          <span className="text-right">Jumlah</span>
          <span>Satuan</span>
          <span />
        </div>

        {/* Rows */}
        {ingredients.map((ing, index) => {
          const inv = inventoryMap.get(ing.inventoryId);
          const unitLabel = inv ? getSmallestUnitLabel(inv) : ing.inventoryId;
          const costInfo = latestCosts?.[ing.inventoryId];
          const costPerUnit = costInfo?.latestCostPerUnit;

          return (
            <div
              key={`${ing.inventoryId}-${index}`}
              className="grid grid-cols-[1fr_90px_50px_28px] gap-2 items-center rounded-lg border border-border/70 bg-background px-3 py-2"
            >
              {/* Bahan name */}
              <div className="min-w-0">
                <p className="text-[11px] font-medium truncate">
                  {inv?.ingredientName ?? ing.inventoryId}
                </p>
                {costPerUnit != null && costPerUnit > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    @ {costPerUnit.toLocaleString("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      maximumFractionDigits: 0,
                    })}
                    /{unitLabel}
                  </p>
                )}
              </div>

              {/* Jumlah input */}
              <Input
                type="number"
                min="0"
                step="0.01"
                value={ing.amount}
                onChange={(e) => updateAmount(index, Number(e.target.value))}
                className="h-7 text-[11px] text-right px-2"
                placeholder="0"
              />

              {/* Satuan */}
              <span className="text-[10px] text-muted-foreground truncate">
                {unitLabel}
              </span>

              {/* Delete */}
              <button
                onClick={() => removeIngredient(index)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Hapus bahan"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {/* Empty */}
        {ingredients.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <p className="text-[11px] text-muted-foreground">
              Belum ada bahan. Tambahkan bahan untuk membuat resep.
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-1">
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!isValid}
          size="sm"
          type="button"
          className="text-[11px]"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Menyimpan..." : "Simpan Resep"}
        </Button>
      </div>
    </div>
  );
}
